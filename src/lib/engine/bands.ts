export type Level = 0 | 1 | 2 | 3 | 4 | 5;

/** US EPA AQI PM2.5 breakpoints, 2024 revision (40 CFR 58 App. G). [concLo, concHi, aqiLo, aqiHi]. */
const EPA_PM25 = [
  [0, 9.0, 0, 50],
  [9.1, 35.4, 51, 100],
  [35.5, 55.4, 101, 150],
  [55.5, 125.4, 151, 200],
  [125.5, 225.4, 201, 300],
  [225.5, 325.4, 301, 500],
] as const;

/** EPA truncates (not rounds) PM2.5 to one decimal. The epsilon absorbs binary-float noise such as 0.7 * 10. */
const truncate1 = (c: number) => Math.floor(c * 10 + 1e-9) / 10;

function assertConc(c: number): void {
  if (!Number.isFinite(c) || c < 0) throw new RangeError(`PM2.5 must be a finite number >= 0, got ${c}`);
}

/** PM2.5 (ug/m3) to US AQI, capped at 500. */
export function aqiFromPm25(c: number): number {
  assertConc(c);
  const t = truncate1(c);
  for (const [cl, ch, il, ih] of EPA_PM25) {
    if (t <= ch) return Math.round(((ih - il) / (ch - cl)) * (t - cl) + il);
  }
  return 500;
}

/** Health level L0..L5 from a PM2.5 concentration (same breakpoints as the AQI categories). */
export function levelOfPm25(c: number): Level {
  assertConc(c);
  const t = truncate1(c);
  const uppers = [9.0, 35.4, 55.4, 125.4, 225.4] as const;
  let level = 0;
  for (const u of uppers) if (t > u) level += 1;
  return level as Level;
}
