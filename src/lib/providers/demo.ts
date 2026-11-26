/**
 * Demo data provider: a real recorded severe-winter-day fixture (§5.1).
 *
 * data/demo-fixture.json was recorded from Open-Meteo/CAMS by
 * `npm run sample:record` (scripts/record-fixture.ts). It keeps 72 hours around
 * the worst 24 h window in the last 14 days. The UI labels it with its real
 * recorded date; synthetic data must never be labelled "recorded".
 */
import type { AirContext, HourPoint } from "../types";
import fixture from "../../../data/demo-fixture.json";

/** Greater Noida sample location (also used by the sample family). */
export const SAMPLE_PLACE = {
  name: "Greater Noida",
  lat: 28.47,
  lon: 77.5,
  country: "IN",
};

interface DemoFixture {
  place: typeof SAMPLE_PLACE;
  recordedDate: string;
  recordedAt: string;
  nowIndex: number;
  hours: HourPoint[];
}

const DEMO = fixture as DemoFixture;

export function getDemoContext(nowIndex = DEMO.nowIndex): AirContext {
  const index = Math.min(Math.max(0, nowIndex), DEMO.hours.length - 1);
  return {
    place: DEMO.place,
    source: "demo",
    dataNote: "recorded",
    recordedDate: DEMO.recordedDate,
    fetchedAt: DEMO.recordedAt,
    hours: DEMO.hours,
    nowIndex: index,
  };
}
