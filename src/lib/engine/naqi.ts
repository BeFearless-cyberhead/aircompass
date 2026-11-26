/** CPCB National AQI, PM-based approximation (PM2.5 and PM10 sub-indices only; max rule). */
type Row = readonly [number, number, number, number];

const PM25: readonly Row[] = [
  [0, 30, 0, 50], [31, 60, 51, 100], [61, 90, 101, 200], [91, 120, 201, 300], [121, 250, 301, 400],
  // CPCB lists Severe only as "250+". Upper anchor 380 is a CONVENTION (assumption), capped at 500.
  [251, 380, 401, 500],
];
const PM10: readonly Row[] = [
  [0, 50, 0, 50], [51, 100, 51, 100], [101, 250, 101, 200], [251, 350, 201, 300], [351, 430, 301, 400],
  [431, 510, 401, 500], // 510 is a convention as above
];

export type NaqiCategory = "Good" | "Satisfactory" | "Moderate" | "Poor" | "Very Poor" | "Severe";

function subIndex(table: readonly Row[], c: number): number {
  if (!Number.isFinite(c) || c < 0) throw new RangeError(`concentration must be finite and >= 0, got ${c}`);
  const x = Math.round(c);
  for (const [cl, ch, il, ih] of table) {
    if (x <= ch) return Math.round(il + ((x - cl) * (ih - il)) / (ch - cl));
  }
  return 500;
}

export const naqiPm25 = (c: number) => subIndex(PM25, c);
export const naqiPm10 = (c: number) => subIndex(PM10, c);

export function naqiCategory(index: number): NaqiCategory {
  if (index <= 50) return "Good";
  if (index <= 100) return "Satisfactory";
  if (index <= 200) return "Moderate";
  if (index <= 300) return "Poor";
  if (index <= 400) return "Very Poor";
  return "Severe";
}

/** Overall index = max sub-index. Inputs are trailing 24 h means; the caller enforces >= 16 valid hours. */
export function naqi(pm25: number, pm10?: number): { index: number; category: NaqiCategory; dominant: "pm25" | "pm10" } {
  const a = naqiPm25(pm25);
  const b = pm10 === undefined ? -1 : naqiPm10(pm10);
  const index = Math.max(a, b);
  return { index, category: naqiCategory(index), dominant: b > a ? "pm10" : "pm25" };
}
