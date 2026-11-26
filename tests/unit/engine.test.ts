import { describe, it, expect } from "vitest";
import en from "../../src/i18n/en.json";
import hi from "../../src/i18n/hi.json";
import { CATALOG } from "@/lib/engine/catalog";
import { computeImpact } from "@/lib/engine/impact";
import { selectActions } from "@/lib/engine/select";
import { buildBaselineScenario } from "@/lib/engine/baseline";
import { getDemoContext } from "@/lib/providers/demo";
import { aqiFromPm25 } from "@/lib/engine/bands";
import type { AirContext, Profile, Level } from "@/lib/types";

function flattenKeys(obj: Record<string, unknown>, prefix = ""): string[] {
  const keys: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    const p = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) {
      keys.push(...flattenKeys(v as Record<string, unknown>, p));
    } else {
      keys.push(p);
    }
  }
  return keys.sort();
}

const SAMPLE_PROFILE: Profile = {
  lang: "en",
  place: { name: "Greater Noida", lat: 28.47, lon: 77.5, country: "IN" },
  household: { adults: 2, children: 1, seniors: 1, conditions: ["respiratory"] },
  home: { type: "apartment", windows: "normal", ac: true, purifier: "none", cooking: "lpg", roomAreaM2: 15 },
  commute: { mode: "car", km: 12, daysPerWeek: 5 },
  habits: { morningOutdoorExercise: true, schoolRun: true },
  budget: "medium",
};

describe("i18n key parity (T02)", () => {
  it("en.json and hi.json have identical keys", () => {
    expect(flattenKeys(en)).toEqual(flattenKeys(hi));
  });
});

describe("action catalog (T08)", () => {
  it("contains 26 unique actions covering all three sections", () => {
    expect(CATALOG.length).toBe(26);
    const ids = new Set(CATALOG.map((a) => a.id));
    expect(ids.size).toBe(26);
    expect(CATALOG.filter((a) => a.section === "routine").length).toBe(9);
    expect(CATALOG.filter((a) => a.section === "indoor").length).toBe(9);
    expect(CATALOG.filter((a) => a.section === "swap").length).toBe(8);
  });

  it("enforces applicability rules for biomass, WFH, and level thresholds", () => {
    const ctx = getDemoContext();
    const lpg = CATALOG.find((a) => a.id === "lpg_instead_of_biomass")!;
    expect(lpg.appliesIf(SAMPLE_PROFILE, ctx, 5)).toBe(false);
    expect(lpg.appliesIf({ ...SAMPLE_PROFILE, home: { ...SAMPLE_PROFILE.home, cooking: "biomass" } }, ctx, 5)).toBe(true);

    const exIndoors = CATALOG.find((a) => a.id === "exercise_indoors_when_poor")!;
    expect(exIndoors.appliesIf(SAMPLE_PROFILE, ctx, 2 as Level)).toBe(false);
    expect(exIndoors.appliesIf(SAMPLE_PROFILE, ctx, 3 as Level)).toBe(true);
  });
});

function dayContext(pm25ByHour: number[]): AirContext {
  return {
    place: SAMPLE_PROFILE.place,
    source: "demo",
    dataNote: "recorded",
    fetchedAt: "2026-11-12T00:00:00Z",
    nowIndex: 0,
    hours: pm25ByHour.map((pm25, i) => ({
      t: `2026-11-12T${String(i).padStart(2, "0")}:00`,
      pm25,
      pm10: pm25 * 1.3,
      usAqi: aqiFromPm25(pm25),
    })),
  };
}

describe("action applicability and context-aware edits (T08)", () => {
  it("places windows and exercise on the forecast's real best/peak hours, not a fixed noon", () => {
    const flat = Array<number>(24).fill(100);
    flat[8] = 20;
    flat[9] = 20; // best 2h window
    flat[16] = 260;
    flat[17] = 280;
    flat[18] = 300; // worst 3h window
    const ctx = dayContext(flat);
    const baseline = buildBaselineScenario(SAMPLE_PROFILE);
    const edit = (id: string) => CATALOG.find((a) => a.id === id)!.edit!(baseline, ctx);

    expect(edit("air_house_in_best_window").windowsOpenHours).toEqual([8, 9]);
    expect(edit("shift_exercise_to_best_window").exerciseHour).toBe(8);
    // Baseline normal-home windows are 07,08,17,18; only the peak hours may be removed.
    expect(edit("close_windows_at_peak").windowsOpenHours).toEqual([7, 8]);

    const shifted = dayContext(flat.map((v, i) => (i === 8 || i === 9 ? 100 : i === 17 || i === 18 ? 20 : v)));
    expect(CATALOG.find((a) => a.id === "air_house_in_best_window")!.edit!(baseline, shifted).windowsOpenHours).toEqual([17, 18]);
  });

  it("matches applicability rules that protect sealed homes, budgets, and child-only advice", () => {
    const ctx = getDemoContext();
    const cases: Array<[string, Profile, Level, boolean]> = [
      ["air_house_in_best_window", { ...SAMPLE_PROFILE, home: { ...SAMPLE_PROFILE.home, windows: "sealed" } }, 5, false],
      ["air_house_in_best_window", SAMPLE_PROFILE, 1, false],
      ["air_house_in_best_window", SAMPLE_PROFILE, 2, true],
      ["close_windows_at_peak", { ...SAMPLE_PROFILE, home: { ...SAMPLE_PROFILE.home, windows: "sealed" } }, 5, false],
      ["lpg_instead_of_biomass", SAMPLE_PROFILE, 5, false],
      ["lpg_instead_of_biomass", { ...SAMPLE_PROFILE, home: { ...SAMPLE_PROFILE.home, cooking: "biomass" } }, 5, true],
      ["induction_cooking", { ...SAMPLE_PROFILE, home: { ...SAMPLE_PROFILE.home, cooking: "induction" } }, 5, false],
      ["walk_or_cycle_short_trips", { ...SAMPLE_PROFILE, commute: { ...SAMPLE_PROFILE.commute, km: 2 } }, 3, false],
      ["walk_or_cycle_short_trips", { ...SAMPLE_PROFILE, commute: { ...SAMPLE_PROFILE.commute, km: 2 } }, 2, true],
      ["wfh_on_worst_day", { ...SAMPLE_PROFILE, commute: { ...SAMPLE_PROFILE.commute, daysPerWeek: 2 } }, 5, false],
      ["wfh_on_worst_day", SAMPLE_PROFILE, 3, false],
      ["wfh_on_worst_day", SAMPLE_PROFILE, 4, true],
    ];
    for (const [id, profile, level, expected] of cases) {
      const action = CATALOG.find((a) => a.id === id)!;
      expect(action.appliesIf(profile, ctx, level), `${id} at L${level}`).toBe(expected);
    }
  });

  it("never ranks a paid action for a zero-budget home and never shows child-only advice without children", () => {
    const ctx = getDemoContext();
    const zeroBudget: Profile = { ...SAMPLE_PROFILE, budget: "zero" };
    const ranked = selectActions(zeroBudget, ctx, buildBaselineScenario(zeroBudget), ctx.hours, ctx.nowIndex);
    const paid = ranked.filter((r) => r.action.cost > 0).map((r) => r.action.id);
    expect(paid).toEqual([]);

    const noChildren: Profile = { ...SAMPLE_PROFILE, household: { ...SAMPLE_PROFILE.household, children: 0 } };
    const withoutKids = selectActions(noChildren, ctx, buildBaselineScenario(noChildren), ctx.hours, ctx.nowIndex);
    expect(withoutKids.map((r) => r.action.id)).not.toContain("child_play_indoors_when_poor");
  });
});

describe("impact ordering and trade-offs (T09)", () => {
  it("preserves honest ordering on severe day: purifier >> N95 > indoor exercise > window timing; transit swaps <= 0", () => {
    const ctx = getDemoContext();
    const baseline = buildBaselineScenario(SAMPLE_PROFILE);

    const impactOf = (id: string, p: Profile = SAMPLE_PROFILE) => {
      const action = CATALOG.find((a) => a.id === id)!;
      return computeImpact(action, p, buildBaselineScenario(p), ctx.hours, ctx.nowIndex);
    };

    const hepa = impactOf("buy_hepa_purifier");
    const diy = impactOf("diy_box_fan_filter");
    const exIndoor = impactOf("exercise_indoors_when_poor");
    const winBest = impactOf("air_house_in_best_window");
    const carToBus = impactOf("commute_to_public_transport");

    // N95 applies to open-transport profile
    const busProfile: Profile = { ...SAMPLE_PROFILE, commute: { mode: "bus", km: 12, daysPerWeek: 5 } };
    const n95 = impactOf("n95_for_open_transport", busProfile);

    expect(hepa.exposureDeltaUgM3).toBeGreaterThan(diy.exposureDeltaUgM3);
    expect(diy.exposureDeltaUgM3).toBeGreaterThan(n95.exposureDeltaUgM3);
    expect(n95.exposureDeltaUgM3).toBeGreaterThan(exIndoor.exposureDeltaUgM3);
    expect(exIndoor.exposureDeltaUgM3).toBeGreaterThan(winBest.exposureDeltaUgM3);

    // Transit swap from car to bus on severe day increases exposure (negative exposureDeltaUgM3), never hidden
    expect(carToBus.exposureDeltaUgM3).toBeLessThanOrEqual(0);
    expect(carToBus.co2eKgPerYear).toBeGreaterThan(0);

    // Three-parameter-set range is ordered [min, max]
    expect(hepa.exposureRangeUgM3[0]).toBeLessThanOrEqual(hepa.exposureRangeUgM3[1]);

    // selectActions returns <= 14 with >= 2 per section
    const selected = selectActions(SAMPLE_PROFILE, ctx, baseline, ctx.hours, ctx.nowIndex);
    expect(selected.length).toBeLessThanOrEqual(14);
    expect(selected.filter((s) => s.action.section === "routine").length).toBeGreaterThanOrEqual(2);
    expect(selected.filter((s) => s.action.section === "indoor").length).toBeGreaterThanOrEqual(2);
    expect(selected.filter((s) => s.action.section === "swap").length).toBeGreaterThanOrEqual(2);
  });
});
