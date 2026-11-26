/**
 * Impact engine (§5.5): computes exposure deltas, CO₂e, and ranges under three parameter sets.
 * Impact.exposureDeltaUgM3 > 0 means air you breathe gets cleaner (better).
 */
import type { Profile, Scenario, HourPoint, Impact } from "../types";
import { computeExposure } from "./exposure";
import { ALL_PARAM_SETS, BASE } from "./sensitivity";
import type { ActionDef } from "./catalog";

/**
 * Compute the impact of an action by comparing baseline vs action-modified scenarios.
 */
export function computeImpact(
  action: ActionDef,
  profile: Profile,
  baselineScenario: Scenario,
  hours: HourPoint[],
  nowIndex: number,
): Impact {
  if (!action.edit) {
    // Guidance-only action
    const co2e = action.co2eKgPerYear?.(profile);
    return {
      actionId: action.id,
      kind: "guidance",
      exposureDeltaUgM3: 0,
      exposureDeltaPct: 0,
      exposureRangeUgM3: [0, 0],
      co2eKgPerYear: co2e,
      confidence: "low",
      method: "Guidance-based recommendation",
      assumptions: [],
    };
  }

  const editContext = { hours, nowIndex };

  // Run under all three parameter sets for ranges
  const deltas: number[] = [];

  for (const params of ALL_PARAM_SETS) {
    const baseline = computeExposure(profile, baselineScenario, hours, nowIndex, params);
    const modified = action.edit(baselineScenario, editContext);
    const after = computeExposure(profile, modified, hours, nowIndex, params);
    // positive delta = better (lower exposure)
    deltas.push(baseline - after);
  }

  // Base set result
  const baseBaseline = computeExposure(profile, baselineScenario, hours, nowIndex, BASE);
  const baseModified = action.edit(baselineScenario, editContext);
  const baseAfter = computeExposure(profile, baseModified, hours, nowIndex, BASE);
  const baseDelta = baseBaseline - baseAfter;
  const basePct = baseBaseline > 0 ? (baseDelta / baseBaseline) * 100 : 0;

  const minDelta = Math.min(...deltas);
  const maxDelta = Math.max(...deltas);

  const co2e = action.co2eKgPerYear?.(profile);

  return {
    actionId: action.id,
    kind: "quantified",
    exposureDeltaUgM3: baseDelta,
    exposureDeltaPct: basePct,
    exposureRangeUgM3: [minDelta, maxDelta],
    co2eKgPerYear: co2e,
    confidence: baseDelta < 0 ? "low" : "medium",
    method: action.method ?? "Exposure model comparison under three parameter sets",
    assumptions: action.assumptions ?? [],
  };
}
