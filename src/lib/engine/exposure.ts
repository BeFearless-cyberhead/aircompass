/**
 * Breathing-weighted exposure: "the average air you actually breathe" (§5.5).
 * exposure = Σ(C·v·f) / Σ(v·f) over sub-slots with fraction f and breathing factor v.
 */
import type { Profile, Scenario, HourPoint } from "../types";
import { stepIndoor, purifierQ, steadyState, type HomeParams } from "./indoor";
import { buildSchedule, type HourSchedule, type SubSlot } from "./schedule";
import type { ParamSet } from "./sensitivity";
import { BASE } from "./sensitivity";

/** Air exchange rates by envelope type */
function airExchangeRate(envelope: Scenario["envelope"], windowOpen: boolean, params: ParamSet): number {
  if (windowOpen) return 4.0;
  switch (envelope) {
    case "sealed": return 0.3;
    case "normal": return params.aWindowsShutNormal;
    case "leaky": return 2.0;
  }
}

/** Concentration multiplier for transport modes */
function transportConcentration(source: SubSlot["concentrationSource"], cOut: number): number {
  switch (source) {
    case "outdoor":
    case "openTransport": return cOut;
    case "car": return 0.6 * cOut;
    case "metro": return 0.7 * cOut;
    case "indoor": return cOut; // placeholder, replaced by indoor model
  }
}

/** CADR values for purifier types */
const PURIFIER_CADR: Record<string, number> = {
  hepa: 250,
  diy: 200,
  none: 0,
};

/** Cooking source term S (µg/m³/h) by fuel type */
function cookingSource(cooking: Profile["home"]["cooking"], cookVent: boolean): number {
  const base: Record<string, number> = { biomass: 60, other: 25, lpg: 10, induction: 0 };
  const s = base[cooking] ?? 0;
  return cookVent ? s * 0.5 : s;
}

/** Cooking hours: 07 and 19 (morning and evening) */
const COOKING_HOURS = [7, 19];

/** Clock hour of a timestamp, falling back to the array index for malformed input. */
function clockHour(t: string | undefined, fallback: number): number {
  const h = Number(t?.slice(11, 13));
  return Number.isInteger(h) && h >= 0 && h < 24 ? h : fallback;
}

/**
 * Compute 24-hour breathing-weighted exposure.
 * Returns exposure in µg/m³.
 */
export function computeExposure(
  profile: Profile,
  scenario: Scenario,
  hours: HourPoint[],
  nowIndex: number,
  params: ParamSet = BASE,
): number {
  const schedule = buildSchedule(profile, scenario);

  // Build indoor concentration for each hour, initialized at steady state of hour 0
  const indoorMeans: number[] = [];
  const cadr = PURIFIER_CADR[scenario.purifier] ?? 0;
  const q = cadr > 0 ? purifierQ(cadr, profile.home.roomAreaM2, params.purifierDerate) : 0;

  const startHour = clockHour(hours[nowIndex]?.t, nowIndex % 24);
  const firstCOut = hours[nowIndex % hours.length]?.pm25 ?? 0;
  const firstA = airExchangeRate(scenario.envelope, scenario.windowsOpenHours.includes(startHour), params);
  const firstQ = scenario.purifierHours.includes(startHour) ? q : 0;
  const firstS = COOKING_HOURS.includes(startHour) ? cookingSource(scenario.cooking, scenario.cookVent) : 0;
  let cIndoor = steadyState(firstCOut, firstA, { P: params.P, k: params.k, q: firstQ, S: firstS });

  for (let i = 0; i < 24; i++) {
    const hourIdx = (nowIndex + i) % hours.length;
    const cOut = hours[hourIdx]?.pm25 ?? 0;
    const clock = (startHour + i) % 24;
    const windowOpen = scenario.windowsOpenHours.includes(clock);
    const a = airExchangeRate(scenario.envelope, windowOpen, params);

    const isCookingHour = COOKING_HOURS.includes(clock);
    const S = isCookingHour ? cookingSource(scenario.cooking, scenario.cookVent) : 0;

    const purifierActive = scenario.purifierHours.includes(clock);
    const effectiveQ = purifierActive ? q : 0;

    const homeParams: HomeParams = { P: params.P, k: params.k, q: effectiveQ, S };
    const result = stepIndoor(cIndoor, cOut, a, homeParams);
    indoorMeans.push(result.cMean);
    cIndoor = result.cEnd;
  }

  // Compute weighted exposure
  let sumCV = 0;
  let sumV = 0;

  for (let i = 0; i < 24; i++) {
    const hourIdx = (nowIndex + i) % hours.length;
    const cOut = hours[hourIdx]?.pm25 ?? 0;
    const clock = (startHour + i) % 24;
    const hourSchedule: HourSchedule = schedule[clock] ?? { hour: clock, slots: [] };

    for (const slot of hourSchedule.slots) {
      let concentration: number;
      if (slot.concentrationSource === "indoor") {
        concentration = indoorMeans[i] ?? cOut;
      } else {
        concentration = transportConcentration(slot.concentrationSource, cOut);
      }

      // Apply N95 mask for open transport and outdoor activities
      if (
        scenario.n95Outdoors &&
        (slot.concentrationSource === "openTransport" || slot.concentrationSource === "outdoor")
      ) {
        concentration *= params.n95Residual;
      }

      sumCV += concentration * slot.breathingFactor * slot.fraction;
      sumV += slot.breathingFactor * slot.fraction;
    }
  }

  return sumV > 0 ? sumCV / sumV : 0;
}
