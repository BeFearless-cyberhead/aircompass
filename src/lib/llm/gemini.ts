/**
 * Gemini structured plan generation with guard + repair + fallback (§6.2, §6.4).
 */
import { z } from "zod";
import type { Profile, AirContext, Plan, PlanResult, Level } from "../types";
import { PlanOut } from "../schemas";
import { findViolations, render, languageOk, type Tokens } from "./guard";
import { generate, isAvailable, type GenerateOptions, type GenerateResult } from "./client";
import { PLAN_SYSTEM_PROMPT, buildPlanPrompt } from "./prompt";
import { buildTokens, todayLevel } from "./tokens";
import { selectActions, type RankedAction } from "../engine/select";
import { computeExposure } from "../engine/exposure";
import { findBestWindow, findAvoidWindow } from "../engine/window";
import { buildFallbackPlan } from "./fallback";
import { BASE } from "../engine/sensitivity";
import { buildBaselineScenario } from "../engine/baseline";
import { withTradeoffMitigations } from "../engine/mitigations";

interface GeneratePlanOptions {
  useLlm?: boolean;
  /** Test/eval seam: replay a recorded model response instead of calling Gemini. */
  generateFn?: typeof generate;
}

/**
 * Generate a plan using Gemini with guard + repair + fallback.
 * Max 2 model calls per plan. Always returns a valid plan.
 */
export async function generatePlan(
  profile: Profile,
  context: AirContext,
  options: GeneratePlanOptions = {},
): Promise<PlanResult> {
  const generateFn = options.generateFn ?? generate;
  const level: Level = todayLevel(context);
  const baseline = buildBaselineScenario(profile);
  const hours = context.hours;
  const nowIndex = context.nowIndex;

  // Select and rank actions
  const ranked = selectActions(profile, context, baseline, hours, nowIndex);

  // Compute exposure
  const exposureBefore = computeExposure(profile, baseline, hours, nowIndex, BASE);

  // Find windows
  const pm25s = hours.slice(nowIndex, nowIndex + 24).map((h) => h.pm25);
  const bestWindow = findBestWindow(pm25s);
  const avoidWindow = findAvoidWindow(pm25s);

  // Build tokens
  const impacts = ranked.map((r) => r.impact);
  const exposureAfter = ranked.length > 0
    ? computeExposure(
        profile,
        ranked[0].action.edit?.(baseline, { hours, nowIndex }) ?? baseline,
        hours,
        nowIndex,
        BASE,
      )
    : exposureBefore;

  const tokens = buildTokens(context, level, bestWindow, avoidWindow, exposureBefore, exposureAfter, impacts);

  // No key, daily cap reached, or explicit fallback: the product stays fully usable.
  // An injected generator is an eval seam and always runs, even without a key.
  if (options.useLlm === false || (!options.generateFn && !isAvailable())) {
    const plan = buildFallbackPlan(ranked, level, profile.lang);
    return { plan: renderPlan(withTradeoffMitigations(plan, ranked, profile.lang), tokens), outcome: "fallback" };
  }

  // Build facts for the LLM
  const facts = {
    level,
    aqi_now: tokens["aqi.now"],
    pm25_now: tokens["pm25.now"],
    best_window: bestWindow
      ? { start: bestWindow.start, end: bestWindow.end }
      : null,
    avoid_window: level <= 1
      ? null
      : avoidWindow
        ? { start: avoidWindow.start, end: avoidWindow.end }
        : null,
    candidates: ranked.slice(0, 14).map((r) => ({
      id: r.action.id,
      section: r.action.section,
      cost: r.action.cost,
      effort: r.action.effort,
      audience: r.action.audience,
      kind: r.impact.kind,
      tradeoff: r.impact.exposureDeltaUgM3 < 0,
      tokens: {
        pct: `{{impact.${r.action.id}.pct}}`,
        ugm3: `{{impact.${r.action.id}.ugm3}}`,
        range: `{{impact.${r.action.id}.range}}`,
        co2e: r.impact.co2eKgPerYear !== undefined ? `{{co2e.${r.action.id}}}` : undefined,
      },
    })),
    members: {
      adults: profile.household.adults,
      children: profile.household.children,
      seniors: profile.household.seniors,
      conditions: profile.household.conditions,
    },
    language: profile.lang,
    budget: profile.budget,
    user_note: profile.notes ? `<user_note>${sanitizeNote(profile.notes)}</user_note>` : undefined,
    available_tokens: Object.keys(tokens).filter((key) => level > 1 || !key.startsWith("avoid.")),
  };

  // Attempt 1
  const result = await safeGenerate(generateFn, {
    systemPrompt: PLAN_SYSTEM_PROMPT,
    userPrompt: buildPlanPrompt(facts, profile.lang),
    // 5–8 cards plus steps and member notes need room; Gemini 3.6 Flash also
    // spends part of this budget on thinking, so 1200 truncated real plans.
    maxOutputTokens: 4800,
    temperature: 0.3,
    timeoutMs: 30000,
    jsonSchema: z.toJSONSchema(PlanOut) as Record<string, unknown>,
  });

  if (result) {
    const validated = validateAndGuard(result.text, tokens, profile.lang, ranked, level);
    if (validated) {
      return {
        plan: renderPlan(withTradeoffMitigations(validated, ranked, profile.lang), tokens),
        outcome: "ai",
      };
    }

    // Attempt 2: repair
    const violations = getViolations(result.text, tokens, profile.lang, level, ranked);
    const repairResult = await safeGenerate(generateFn, {
      systemPrompt: PLAN_SYSTEM_PROMPT,
      userPrompt: `${buildPlanPrompt(facts, profile.lang)}\n\nYour previous response had these violations: ${violations.join(", ")}. Fix them. Remember: use {{tokens}} for all numbers, never write digits directly.`,
      maxOutputTokens: 4800,
      temperature: 0.2,
      timeoutMs: 30000,
      jsonSchema: z.toJSONSchema(PlanOut) as Record<string, unknown>,
    });

    if (repairResult) {
      const revalidated = validateAndGuard(repairResult.text, tokens, profile.lang, ranked, level);
      if (revalidated) {
        return {
          plan: renderPlan(withTradeoffMitigations(revalidated, ranked, profile.lang), tokens),
          outcome: "repaired",
        };
      }
    }
  }

  // Fallback
  const plan = buildFallbackPlan(ranked, level, profile.lang);
  return { plan: renderPlan(withTradeoffMitigations(plan, ranked, profile.lang), tokens), outcome: "fallback" };
}

/** A model failure (timeout, quota, network) is never fatal: the engine plan is the floor. */
async function safeGenerate(fn: typeof generate, opts: GenerateOptions): Promise<GenerateResult | null> {
  try {
    return await fn(opts);
  } catch {
    return null;
  }
}

/** Sanitize user notes: strip control chars, limit length */
function sanitizeNote(note: string): string {
  return note.replace(/[\x00-\x1f\x7f]/g, "").slice(0, 300);
}

/** Validate LLM output against schema and guard */
function validateAndGuard(
  text: string,
  tokens: Tokens,
  lang: "en" | "hi",
  ranked: RankedAction[],
  level: Level,
): Plan | null {
  try {
    const parsed = JSON.parse(text);
    const result = PlanOut.safeParse(parsed);
    if (!result.success) return null;

    const plan = result.data as Plan;

    // Check actionIds are from candidates
    const candidateIds = new Set(ranked.map((r) => r.action.id));
    for (const card of plan.cards) {
      if (!candidateIds.has(card.actionId)) return null;
    }

    // Check unique actionIds
    const ids = new Set(plan.cards.map((c) => c.actionId));
    if (ids.size !== plan.cards.length) return null;

    // Every section with a candidate must be represented (I11) so the plan cannot
    // collapse into only routine advice when indoor/swap options exist.
    const sections = new Set(
      ranked.map((r) => r.action.section),
    );
    const cardSections = new Set(
      plan.cards.map((c) => ranked.find((r) => r.action.id === c.actionId)?.action.section),
    );
    for (const section of sections) {
      if (!cardSections.has(section)) return null;
    }

    // Guard check on all text fields
    const allText = [
      plan.headline,
      plan.summary,
      ...plan.cards.flatMap((c) => [c.title, c.why, c.when, ...c.steps]),
      ...plan.memberNotes.map((n) => n.note),
      ...plan.tradeoffs,
    ].join(" ");

    const violations = findViolations(allText, tokens);
    if (violations.length > 0) return null;

    // Language check
    if (!languageOk(allText, lang)) return null;

    // Calm-day policy: L0–L1 must not contain avoid/alarm copy (I10).
    if (level <= 1 && ALARM_COPY.test(allText)) return null;

    return plan;
  } catch {
    return null;
  }
}

const ALARM_COPY = /stay indoors|hazardous|emergency|danger(?:ous)?\b|avoid (?:going outside|outdoor|all outdoor|exercise outdoors|travel|the outdoors)|बाहर (?:जाने|निकलने) से बचें|घर के अंदर रहें|खतरनाक/i;

/** Get violation labels for repair prompt */
function getViolations(
  text: string,
  tokens: Tokens,
  lang: "en" | "hi",
  level: Level,
  ranked: RankedAction[],
): string[] {
  const violations: string[] = [];
  try {
    const parsed = JSON.parse(text);
    const result = PlanOut.safeParse(parsed);
    if (!result.success) {
      violations.push("schema validation failed");
      return violations;
    }
    const plan = result.data as Plan;

    const candidateIds = new Set(ranked.map((r) => r.action.id));
    if (plan.cards.some((c) => !candidateIds.has(c.actionId))) {
      violations.push("actionId is not a candidate");
    }
    const ids = plan.cards.map((c) => c.actionId);
    if (new Set(ids).size !== ids.length) violations.push("duplicate actionId");
    const sections = new Set(ranked.map((r) => r.action.section));
    const cardSections = new Set(
      plan.cards.map((c) => ranked.find((r) => r.action.id === c.actionId)?.action.section),
    );
    for (const section of sections) {
      if (!cardSections.has(section)) violations.push(`missing section: ${section}`);
    }

    const allText = [
      plan.headline,
      plan.summary,
      ...plan.cards.flatMap((c) => [c.title, c.why, c.when, ...c.steps]),
      ...plan.memberNotes.map((n) => n.note),
      ...plan.tradeoffs,
    ].join(" ");

    violations.push(...findViolations(allText, tokens));
    if (!languageOk(allText, lang)) violations.push("wrong language");
    if (level <= 1 && ALARM_COPY.test(allText)) violations.push("alarm copy on a clean day");
  } catch {
    violations.push("invalid JSON");
  }
  return violations;
}

/** Render all tokens in the plan text fields */
function renderPlan(plan: Plan, tokens: Tokens): Plan {
  return {
    headline: render(plan.headline, tokens),
    summary: render(plan.summary, tokens),
    cards: plan.cards.map((c) => ({
      ...c,
      title: render(c.title, tokens),
      why: render(c.why, tokens),
      when: render(c.when, tokens),
      steps: c.steps.map((s) => render(s, tokens)),
    })),
    memberNotes: plan.memberNotes.map((n) => ({
      ...n,
      note: render(n.note, tokens),
    })),
    tradeoffs: plan.tradeoffs.map((t) => render(t, tokens)),
  };
}
