/**
 * Token system: numbers by reference (§6.3).
 * The LLM writes {{tokens}}; code substitutes values with their units.
 */
import type { AirContext, Impact, Level } from "../types";
import { aqiFromPm25, levelOfPm25 } from "../engine/bands";
import { naqi } from "../engine/naqi";
import type { WindowResult } from "../types";
import type { Tokens } from "./guard";

/** Level names for display */
const LEVEL_NAMES: Record<Level, string> = {
  0: "Good",
  1: "Moderate",
  2: "Unhealthy for Sensitive Groups",
  3: "Unhealthy",
  4: "Very Unhealthy",
  5: "Hazardous",
};

/**
 * Build the token map from engine results.
 * Tokens render WITH their units; the model must not append its own.
 */
export function buildTokens(
  context: AirContext,
  level: Level,
  bestWindow: WindowResult | null,
  avoidWindow: WindowResult | null,
  exposureBefore: number,
  exposureAfter: number,
  impacts: Impact[],
): Tokens {
  const tokens: Tokens = {};

  // Current hour AQI
  const nowHour = context.hours[context.nowIndex];
  if (nowHour) {
    tokens["aqi.now"] = String(aqiFromPm25(nowHour.pm25));
    tokens["pm25.now"] = `${Math.round(nowHour.pm25)} µg/m³`;
  }

  // Level
  tokens["level.name"] = LEVEL_NAMES[level];
  tokens["level.number"] = String(level);

  // Best and avoid windows
  if (bestWindow) {
    tokens["best.start"] = `${bestWindow.start}:00`;
    tokens["best.end"] = `${bestWindow.end}:00`;
  }
  if (avoidWindow) {
    tokens["avoid.start"] = `${avoidWindow.start}:00`;
    tokens["avoid.end"] = `${avoidWindow.end}:00`;
  }

  // Exposure
  tokens["exposure.before"] = `${Math.round(exposureBefore)} µg/m³`;
  tokens["exposure.after"] = `${Math.round(exposureAfter)} µg/m³`;

  // NAQI for India
  const next24pm25 = context.hours
    .slice(context.nowIndex, context.nowIndex + 24)
    .map((h) => h.pm25);
  if (next24pm25.length >= 16) {
    const meanPm25 = next24pm25.reduce((a, b) => a + b, 0) / next24pm25.length;
    const naqiResult = naqi(meanPm25);
    tokens["naqi.index"] = String(naqiResult.index);
    tokens["naqi.category"] = naqiResult.category;
  }

  // Impact tokens for each action
  for (const imp of impacts) {
    const id = imp.actionId;
    tokens[`impact.${id}.pct`] = `${Math.abs(Math.round(imp.exposureDeltaPct))} %`;
    tokens[`impact.${id}.ugm3`] = `${Math.abs(Math.round(imp.exposureDeltaUgM3))} µg/m³`;
    tokens[`impact.${id}.range`] = `${Math.round(imp.exposureRangeUgM3[0])}–${Math.round(imp.exposureRangeUgM3[1])} µg/m³`;
    if (imp.co2eKgPerYear !== undefined) {
      tokens[`co2e.${id}`] = `${Math.round(imp.co2eKgPerYear)} kg CO₂e/yr`;
    }
  }

  return tokens;
}

/** Average PM2.5 over next 24 hours from nowIndex */
export function meanPm25Next24(context: AirContext): number {
  const slice = context.hours.slice(context.nowIndex, context.nowIndex + 24);
  if (slice.length === 0) return 0;
  return slice.reduce((a, b) => a + b.pm25, 0) / slice.length;
}

/** Get today's level from mean PM2.5 */
export function todayLevel(context: AirContext): Level {
  return levelOfPm25(meanPm25Next24(context));
}
