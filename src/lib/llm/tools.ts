/**
 * Chat tool definitions for function calling (§6.5).
 * Tool: simulate_scenario — runs the engine with modified parameters.
 */
import type { Profile, Scenario, HourPoint } from "../types";
import { computeExposure } from "../engine/exposure";
import { buildBaselineScenario } from "../engine/baseline";
import { BASE } from "../engine/sensitivity";
import { ScenarioChangeSchema } from "../schemas";
import type { CommuteMode } from "../types";

export interface SimulationResult {
  before: number;
  after: number;
  delta: number;
  pct: number;
  assumptions: string[];
}

/**
 * Simulate a scenario change and return before/after exposure.
 * Validates the changes with Zod.
 */
export function simulateScenario(
  changes: Record<string, unknown>,
  profile: Profile,
  hours: HourPoint[],
  nowIndex: number,
): SimulationResult {
  const parsed = ScenarioChangeSchema.parse(changes);

  const baseline = buildBaselineScenario(profile);
  const before = computeExposure(profile, baseline, hours, nowIndex, BASE);

  // Apply changes to baseline
  const modified: Scenario = {
    ...baseline,
    ...(parsed.windowsOpenHours !== undefined && { windowsOpenHours: parsed.windowsOpenHours }),
    ...(parsed.purifier !== undefined && {
      purifier: parsed.purifier,
      purifierHours: parsed.purifier !== "none" ? Array.from({ length: 24 }, (_, i) => i) : [],
    }),
    ...(parsed.exerciseHour !== undefined && { exerciseHour: parsed.exerciseHour }),
    ...(parsed.exerciseIndoors !== undefined && { exerciseIndoors: parsed.exerciseIndoors }),
    ...(parsed.commuteMode !== undefined && { commuteMode: parsed.commuteMode as CommuteMode }),
    ...(parsed.commuteDaysPerWeek !== undefined && { commuteDaysPerWeek: parsed.commuteDaysPerWeek }),
    ...(parsed.n95Outdoors !== undefined && { n95Outdoors: parsed.n95Outdoors }),
    ...(parsed.cookVent !== undefined && { cookVent: parsed.cookVent }),
  };

  const after = computeExposure(profile, modified, hours, nowIndex, BASE);
  const delta = before - after;
  const pct = before > 0 ? (delta / before) * 100 : 0;

  return {
    before: Math.round(before * 10) / 10,
    after: Math.round(after * 10) / 10,
    delta: Math.round(delta * 10) / 10,
    pct: Math.round(pct * 10) / 10,
    assumptions: ["Single-zone indoor model", "Base parameter set"],
  };
}
