import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { computeExposure } from "@/lib/engine/exposure";
import { findBestWindow, findAvoidWindow } from "@/lib/engine/window";
import type { HourPoint, Profile, Scenario } from "@/lib/types";

const BASE_PROFILE: Profile = {
  lang: "en",
  place: { name: "Test", lat: 28.47, lon: 77.5, country: "IN" },
  household: { adults: 1, children: 0, seniors: 0, conditions: [] },
  home: { type: "apartment", windows: "normal", ac: false, purifier: "none", cooking: "induction", roomAreaM2: 15 },
  commute: { mode: "bus", km: 10, daysPerWeek: 5 },
  habits: { morningOutdoorExercise: true, schoolRun: false },
  budget: "low",
};

const BASE_SCENARIO: Scenario = {
  windowsOpenHours: [7, 8],
  envelope: "normal",
  purifier: "none",
  purifierHours: [],
  exerciseHour: 6,
  exerciseIndoors: false,
  commuteMode: "bus",
  commuteDaysPerWeek: 5,
  n95Outdoors: false,
  cooking: "induction",
  cookVent: false,
};

describe("property-based invariants", () => {
  it("N95 never raises exposure and exposure <= max outdoor when no cooking source", () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 10, max: 450 }), { minLength: 24, maxLength: 24 }),
        (pm25s) => {
          const hours: HourPoint[] = pm25s.map((pm25, i) => ({
            t: `2025-11-15T${String(i).padStart(2, "0")}:00`,
            pm25,
            pm10: pm25 * 1.3,
            usAqi: 150,
          }));
          const withoutMask = computeExposure(BASE_PROFILE, BASE_SCENARIO, hours, 0);
          const withMask = computeExposure(BASE_PROFILE, { ...BASE_SCENARIO, n95Outdoors: true }, hours, 0);
          const maxOut = Math.max(...pm25s);
          expect(withMask).toBeLessThanOrEqual(withoutMask + 1e-9);
          expect(withoutMask).toBeLessThanOrEqual(maxOut + 1e-9);
        },
      ),
      { numRuns: 50 },
    );
  });

  it("best window mean <= avoid window mean on any 24h day", () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 5, max: 500 }), { minLength: 24, maxLength: 24 }),
        (pm25s) => {
          const best = findBestWindow(pm25s);
          const avoid = findAvoidWindow(pm25s);
          expect(best).not.toBeNull();
          expect(avoid).not.toBeNull();
          expect(best!.mean).toBeLessThanOrEqual(avoid!.mean + 1e-9);
        },
      ),
      { numRuns: 100 },
    );
  });
});
