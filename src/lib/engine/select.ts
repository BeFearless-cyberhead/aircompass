/**
 * Action ranking and selection (§5.9).
 * Filter → score → top 14 with ≥ 2 per section → send to LLM.
 */
import type { Profile, AirContext, Scenario, HourPoint, Level, Impact } from "../types";
import { CATALOG, type ActionDef } from "./catalog";
import { computeImpact } from "./impact";
import { levelOfPm25 } from "./bands";
import type { Group } from "../types";

export interface RankedAction {
  action: ActionDef;
  impact: Impact;
  score: number;
}

/** Get groups present in the household */
function householdGroups(profile: Profile): Group[] {
  const groups: Group[] = ["adult"];
  if (profile.household.children > 0) groups.push("child");
  if (profile.household.seniors > 0) groups.push("senior");
  for (const c of profile.household.conditions) groups.push(c);
  return groups;
}

/**
 * Rank and select actions for the LLM plan call.
 * Returns the top 14 candidates with ≥ 2 per section.
 */
export function selectActions(
  profile: Profile,
  context: AirContext,
  baselineScenario: Scenario,
  hours: HourPoint[],
  nowIndex: number,
): RankedAction[] {
  // Determine level from mean PM2.5 over next 24h
  const next24 = [];
  for (let i = 0; i < 24 && nowIndex + i < hours.length; i++) {
    next24.push(hours[nowIndex + i].pm25);
  }
  const meanPm25 = next24.length > 0 ? next24.reduce((a, b) => a + b, 0) / next24.length : 0;
  const level: Level = levelOfPm25(meanPm25);

  const groups = householdGroups(profile);

  // Filter and score
  const candidates: RankedAction[] = [];

  for (const action of CATALOG) {
    // Applicability check
    if (!action.appliesIf(profile, context, level)) continue;

    // Budget filter
    if (profile.budget === "zero" && action.cost > 0) continue;
    if (profile.budget === "low" && action.cost > 1) continue;

    // Audience check: at least one group matches
    if (!action.audience.some((a) => groups.includes(a))) continue;

    const impact = computeImpact(action, profile, baselineScenario, hours, nowIndex);

    // Score: 0.6·exposure + 0.2·co2e + 0.1·audience + 0.1·ease
    const exposureScore = impact.kind === "quantified"
      ? 0.6 * Math.min(Math.max(impact.exposureDeltaPct, 0), 50) / 50
      : 0;
    const co2eScore = 0.2 * Math.min((impact.co2eKgPerYear ?? 0) / 500, 1);
    const audienceMatch = action.audience.filter((a) => groups.includes(a)).length / groups.length;
    const audienceScore = 0.1 * audienceMatch;
    const easeScore = 0.1 * (1 - (action.cost + action.effort) / 5);

    let score = exposureScore + co2eScore + audienceScore + easeScore;

    // Penalty for negative exposure delta (trade-off) unless CO₂e >= 300
    if (impact.exposureDeltaUgM3 < 0 && (impact.co2eKgPerYear ?? 0) < 300) {
      score -= 0.2;
    }

    candidates.push({ action, impact, score });
  }

  // Sort by score descending
  candidates.sort((a, b) => b.score - a.score);

  // Ensure ≥ 2 per section in top 14
  const result: RankedAction[] = [];
  const sectionCount: Record<string, number> = { routine: 0, indoor: 0, swap: 0 };

  // First pass: take top scored items
  for (const c of candidates) {
    if (result.length >= 14) break;
    result.push(c);
    sectionCount[c.action.section]++;
  }

  // Second pass: ensure minimum per section
  for (const section of ["routine", "indoor", "swap"] as const) {
    if (sectionCount[section] < 2) {
      const needed = 2 - sectionCount[section];
      const extras = candidates
        .filter((c) => c.action.section === section && !result.includes(c))
        .slice(0, needed);
      for (const e of extras) {
        if (result.length >= 14) {
          // Replace the lowest-scored item from an over-represented section
          const overSection = Object.entries(sectionCount).find(([, v]) => v > 3)?.[0];
          if (overSection) {
            const idx = result.findLastIndex((r) => r.action.section === overSection);
            if (idx >= 0) {
              sectionCount[overSection]--;
              result.splice(idx, 1);
            }
          }
        }
        result.push(e);
        sectionCount[section]++;
      }
    }
  }

  return result;
}
