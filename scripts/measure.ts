#!/usr/bin/env node
/**
 * Measured efficiency evidence (§14). Writes docs/EFFICIENCY.md.
 *
 * - Engine p50/p95 over 200 local runs.
 * - Mocked /api/plan path (recorded Gemini response) over 20 runs.
 * - One real Gemini plan when a key is present; never required, never printed.
 * - First-load JS per route from the production build, gzipped.
 *
 * Run after `npm run build`: npm run measure
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { cpus, platform, release } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { getDemoContext } from "../src/lib/providers/demo";
import { selectActions } from "../src/lib/engine/select";
import { buildBaselineScenario } from "../src/lib/engine/baseline";
import { computeExposure } from "../src/lib/engine/exposure";
import { BASE } from "../src/lib/engine/sensitivity";
import { generatePlan } from "../src/lib/llm/gemini";
import { generate, isAvailable } from "../src/lib/llm/client";
import type { GenerateOptions, GenerateResult } from "../src/lib/llm/client";
import type { Profile } from "../src/lib/types";

const ROOT = process.cwd();
const SAMPLE_PROFILE: Profile = {
  lang: "en",
  place: { name: "Greater Noida", lat: 28.47, lon: 77.5, country: "IN" },
  household: { adults: 2, children: 1, seniors: 1, conditions: ["respiratory"] },
  home: { type: "apartment", windows: "normal", ac: true, purifier: "none", cooking: "lpg", roomAreaM2: 15 },
  commute: { mode: "car", km: 12, daysPerWeek: 5 },
  habits: { morningOutdoorExercise: true, schoolRun: true },
  budget: "low",
};

function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

function ms(values: number[]): string {
  return `${percentile(values, 50).toFixed(1)} / ${percentile(values, 95).toFixed(1)} ms`;
}

function engineBench(): string {
  const context = getDemoContext();
  const baseline = buildBaselineScenario(SAMPLE_PROFILE);
  const runs: number[] = [];
  for (let i = 0; i < 200; i++) {
    const start = performance.now();
    const ranked = selectActions(SAMPLE_PROFILE, context, baseline, context.hours, context.nowIndex);
    computeExposure(SAMPLE_PROFILE, baseline, context.hours, context.nowIndex, BASE);
    if (ranked.length === 0) throw new Error("engine returned no actions");
    runs.push(performance.now() - start);
  }
  return ms(runs);
}

function fixtureResponse(): string {
  const file = join(ROOT, "evals", "fixtures", "p01-noida-family.json");
  if (!existsSync(file)) throw new Error("Missing eval fixture; run npm run eval:live first");
  const fixture = JSON.parse(readFileSync(file, "utf8")) as { responses: (string | null)[] };
  const raw = fixture.responses.find((r) => typeof r === "string");
  if (!raw) throw new Error("No recorded response in p01 fixture");
  return raw;
}

async function mockedPlanBench(): Promise<string> {
  const context = getDemoContext();
  const raw = fixtureResponse();
  const runs: number[] = [];
  for (let i = 0; i < 20; i++) {
    const start = performance.now();
    const result = await generatePlan(SAMPLE_PROFILE, context, {
      generateFn: async () => ({ text: raw, tokensIn: 0, tokensOut: 0 }),
    });
    if (!result.plan.cards.length) throw new Error("mocked plan returned no cards");
    runs.push(performance.now() - start);
  }
  return ms(runs);
}

interface RealResult {
  latency: string;
  outcome: string;
  tokens: string;
}

async function realPlan(): Promise<RealResult | null> {
  if (!isAvailable() || process.env.MEASURE_REAL === "0") return null;
  const context = getDemoContext();
  const usage: { value: GenerateResult | null } = { value: null };
  const started = performance.now();
  const result = await generatePlan(SAMPLE_PROFILE, context, {
    generateFn: async (opts: GenerateOptions) => {
      const res = await generate(opts);
      if (res) usage.value = res;
      return res;
    },
  });
  const latency = `${(performance.now() - started).toFixed(1)} ms`;
  const tokens = usage.value
    ? `${usage.value.tokensIn ?? "?"} in / ${usage.value.tokensOut ?? "?"} out`
    : "not returned (engine fallback)";
  return { latency, outcome: result.outcome, tokens };
}

interface ClientManifest {
  entryJSFiles?: Record<string, string[]>;
}

function routeManifest(route: string): string {
  const name = route === "/" ? "page_client-reference-manifest.js" : `${route.slice(1)}/page_client-reference-manifest.js`;
  return join(ROOT, ".next", "server", "app", name);
}

function firstLoadJs(route: string): number {
  const build = JSON.parse(readFileSync(join(ROOT, ".next", "build-manifest.json"), "utf8")) as {
    rootMainFiles?: string[];
    polyfillFiles?: string[];
  };
  const files = new Set<string>([...(build.rootMainFiles ?? []), ...(build.polyfillFiles ?? [])]);
  const path = routeManifest(route);
  if (existsSync(path)) {
    const raw = readFileSync(path, "utf8");
    const start = raw.lastIndexOf("= ");
    const end = raw.lastIndexOf(";");
    if (start >= 0 && end > start) {
      const manifest = JSON.parse(raw.slice(start + 2, end)) as ClientManifest;
      for (const list of Object.values(manifest.entryJSFiles ?? {})) {
        for (const file of list) files.add(file);
      }
    }
  }
  let total = 0;
  for (const file of files) {
    const full = join(ROOT, ".next", file);
    if (!existsSync(full)) continue;
    total += gzipSync(readFileSync(full)).length;
  }
  return Math.round(total / 1024);
}

async function main() {
  if (!existsSync(join(ROOT, ".next", "build-manifest.json"))) {
    throw new Error("Missing .next build. Run npm run build first.");
  }

  const engine = engineBench();
  const mocked = await mockedPlanBench();
  const real = await realPlan();
  const routes = ["/", "/plan", "/impact", "/brief", "/setup", "/about"];

  const date = new Date().toISOString().slice(0, 10);
  const machine = `${cpus()[0]?.model ?? "unknown CPU"} · ${platform()} ${release()} · Node ${process.version}`;
  const lines = [
    "# Efficiency",
    "",
    `Measured ${date} on ${machine}. Reproduce with \`npm run build && npm run measure\`.`,
    "The real Gemini row is one live call on that day; it is not a percentile and it may fall back.",
    "",
    "| Measurement | Result |",
    "|---|---:|",
    `| Engine \`selectActions\` + \`computeExposure\`, p50 / p95 (200 runs) | ${engine} |`,
    `| \`generatePlan\` with recorded model response, p50 / p95 (20 runs) | ${mocked} |`,
    `| First-load JS, gzipped | ${routes.map((r) => `${r} ${firstLoadJs(r)} kB`).join(" · ")} |`,
    real
      ? `| Live \`generatePlan\` (one call) | ${real.latency}; outcome **${real.outcome}**; tokens ${real.tokens} |`
      : "| Live `generatePlan` | not run (no API key or MEASURE_REAL=0) |",
    "",
    "## Budget",
    "",
    "- One structured model call per plan, at most one repair call.",
    "- 1 h upstream cache keyed by rounded coordinates; Open-Meteo air and weather fetched in parallel.",
    "- The plan prompt is static; only the facts block changes, so the provider can reuse its prefix cache.",
    "- What-if recomputation is client-side; charts are inline SVG/CSS, not a charting bundle.",
    "- `maxOutputTokens` is capped at 4800; a timeout or provider error returns the deterministic engine plan.",
    "",
    "## Notes",
    "",
    "- The engine is pure TypeScript and runs in single-digit milliseconds locally; the real cost is the upstream API and model latency.",
    "- The production build is served by `next start`; e2e and CSP gates run against that build, not `next dev`.",
    "- Lighthouse was not run by this script. Record any manual run in `docs/ACCESSIBILITY.md` with the date and device.",
  ];

  mkdirSync(join(ROOT, "docs"), { recursive: true });
  writeFileSync(join(ROOT, "docs", "EFFICIENCY.md"), lines.join("\n") + "\n");
  console.log(lines.slice(6, 12).join("\n"));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
