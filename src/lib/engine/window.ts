/**
 * Best-window finder (§5.7).
 * Go out / air the house = lowest contiguous 2h window between 08:00–20:00.
 * Avoid = highest contiguous 3h across the whole day.
 * Ties: earliest. If best window is L4+, "no good window today".
 */
import type { HourPoint, WindowResult } from "../types";

/**
 * Find the best 2-hour contiguous window (lowest mean PM2.5) between startSearch and endSearch.
 * @param pm25 Array of 24 hourly PM2.5 values (index 0 = hour 0)
 * @param startSearch Start hour (inclusive), default 8
 * @param endSearch End hour (exclusive for window start), default 19 (so last window is 18–20)
 */
export function findBestWindow(
  pm25: number[],
  startSearch = 8,
  endSearch = 19,
): WindowResult | null {
  if (pm25.length < 2) return null;
  let best: WindowResult | null = null;

  for (let s = startSearch; s <= endSearch - 1 && s + 1 < pm25.length; s++) {
    const mean = (pm25[s] + pm25[s + 1]) / 2;
    if (best === null || mean < best.mean) {
      best = { start: s, end: s + 2, mean };
    }
    // Ties: earliest (we iterate forward, so first found wins if strictly less)
  }

  return best;
}

/**
 * Find the worst 3-hour contiguous window (highest mean PM2.5) across the full day.
 * @param pm25 Array of 24 hourly PM2.5 values
 */
export function findAvoidWindow(pm25: number[]): WindowResult | null {
  if (pm25.length < 3) return null;
  let worst: WindowResult | null = null;

  for (let s = 0; s + 2 < pm25.length; s++) {
    const mean = (pm25[s] + pm25[s + 1] + pm25[s + 2]) / 3;
    if (worst === null || mean > worst.mean) {
      worst = { start: s, end: s + 3, mean };
    }
  }

  return worst;
}

/**
 * Map the next 24 hours onto clock hours (0–23). Hours are keyed by the timestamp's
 * own hour, so a context that starts mid-day still lines up with a household schedule.
 * Missing clock hours inherit the 24-hour mean rather than a misleading zero.
 */
export function hourlyByClock(hours: HourPoint[], nowIndex: number): number[] {
  const next24 = hours.slice(nowIndex, nowIndex + 24);
  const mean =
    next24.length > 0 ? next24.reduce((sum, h) => sum + h.pm25, 0) / next24.length : 0;
  const byHour = Array<number>(24).fill(mean);
  for (const h of next24) {
    const hr = Number(h.t.slice(11, 13));
    if (Number.isInteger(hr) && hr >= 0 && hr < 24) byHour[hr] = h.pm25;
  }
  return byHour;
}

/** Clock hours of the best 2-hour window in the next 24 hours, or [] if unavailable. */
export function bestWindowHours(hours: HourPoint[], nowIndex: number): number[] {
  const w = findBestWindow(hourlyByClock(hours, nowIndex));
  return w ? [w.start, w.start + 1] : [];
}

/** Clock hours of the worst 3-hour window in the next 24 hours, or [] if unavailable. */
export function avoidWindowHours(hours: HourPoint[], nowIndex: number): number[] {
  const w = findAvoidWindow(hourlyByClock(hours, nowIndex));
  return w ? [w.start, w.start + 1, w.start + 2] : [];
}
