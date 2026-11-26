/**
 * CO₂e emissions from commute mode switches (§5.6).
 * kgCO2e/yr = kmOneWay × 2 × daysPerWeek × 48 × (EF_from − EF_to)
 */
import type { CommuteMode } from "../types";

/** kg CO₂e per passenger-km (starter values, replace with DEFRA/India GHG Program factors) */
export const EMISSION_FACTORS: Record<CommuteMode, number> = {
  car: 0.17,
  two_wheeler: 0.10,
  auto: 0.09,
  bus: 0.07,
  metro: 0.035,
  walk: 0,
  cycle: 0,
  wfh: 0,
};

/** Annual CO₂e savings from switching commute modes. 48 working weeks assumed. */
export function co2ePerYear(
  kmOneWay: number,
  daysPerWeek: number,
  from: CommuteMode,
  to: CommuteMode,
): number {
  const efFrom = EMISSION_FACTORS[from] ?? 0;
  const efTo = EMISSION_FACTORS[to] ?? 0;
  return kmOneWay * 2 * daysPerWeek * 48 * (efFrom - efTo);
}

/**
 * Idling emissions range (assumption + range): 0.6–1.0 L/h petrol × 5 min/day × 250 days × ~2.3 kg CO₂/L
 * Returns [low, high] in kg CO₂e/yr
 */
export function idlingRange(): [number, number] {
  const minL = 0.6, maxL = 1.0;
  const minPerDay = 5 / 60; // 5 minutes in hours
  const days = 250;
  const kgPerL = 2.3;
  return [
    minL * minPerDay * days * kgPerL,
    maxL * minPerDay * days * kgPerL,
  ];
}

/** Trip chaining: assume 10% fewer km (range 5–15%). Returns [low, high] annual savings in kg CO₂e. */
export function tripChainingRange(
  kmOneWay: number,
  daysPerWeek: number,
  mode: CommuteMode,
): [number, number] {
  const ef = EMISSION_FACTORS[mode] ?? 0;
  const annualKm = kmOneWay * 2 * daysPerWeek * 48;
  return [annualKm * 0.05 * ef, annualKm * 0.15 * ef];
}

/** Community multiplier: households × kgCO2e/yr */
export function communityImpact(households: number, kgPerYear: number): number {
  return households * kgPerYear;
}
