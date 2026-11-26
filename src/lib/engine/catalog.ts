/**
 * Action catalog: 26 entries (§5.8).
 * Each action has an id, section, applicability filter, optional scenario edit, and optional CO₂e effect.
 */
import type { Profile, AirContext, Scenario, Level, CommuteMode, Group, HourPoint } from "../types";
import { co2ePerYear, idlingRange, tripChainingRange } from "./emissions";
import { bestWindowHours, avoidWindowHours } from "./window";

/** Context a scenario edit needs to place time-dependent actions on the actual forecast. */
export interface EditContext {
  hours: HourPoint[];
  nowIndex: number;
}

export interface ActionDef {
  id: string;
  section: "routine" | "indoor" | "swap";
  appliesIf: (p: Profile, c: AirContext, level: Level) => boolean;
  edit?: (s: Scenario, c: EditContext) => Scenario;
  co2eKgPerYear?: (p: Profile) => number;
  cost: 0 | 1 | 2;
  effort: 1 | 2 | 3;
  audience: Group[];
  i18nKey: string;
  method?: string;
  assumptions?: string[];
}

function hasSensitiveMember(p: Profile): boolean {
  return p.household.children > 0 || p.household.seniors > 0 || p.household.conditions.length > 0;
}


function clone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj)) as T;
}

export const CATALOG: ActionDef[] = [
  // === ROUTINE ===
  {
    id: "shift_exercise_to_best_window",
    section: "routine",
    // At L3+ a sensitive household should not be told to exercise outdoors, even in the cleanest window.
    appliesIf: (p, _c, level) => p.habits.morningOutdoorExercise && (level < 3 || !hasSensitiveMember(p)),
    edit: (s, c) => ({
      ...clone(s),
      exerciseHour: bestWindowHours(c.hours, c.nowIndex)[0] ?? 12,
    }),
    cost: 0, effort: 1,
    audience: ["adult", "senior", "child"],
    i18nKey: "action.shift_exercise",
    method: "Shift outdoor exercise to lowest PM2.5 window",
    assumptions: ["Exercise duration ~30 min"],
  },
  {
    id: "exercise_indoors_when_poor",
    section: "routine",
    appliesIf: (p, _c, level) => p.habits.morningOutdoorExercise && level >= 3,
    edit: (s) => ({ ...clone(s), exerciseIndoors: true }),
    cost: 0, effort: 1,
    audience: ["adult", "senior", "child"],
    i18nKey: "action.exercise_indoors",
    method: "Indoor exercise vs outdoor: breathing factor 2.5× indoor vs 4× outdoor concentration",
    assumptions: ["Indoor concentration from home-air model"],
  },
  {
    id: "n95_for_open_transport",
    section: "routine",
    appliesIf: (p, _c, level) =>
      ["walk", "cycle", "two_wheeler", "auto", "bus"].includes(p.commute.mode) && level >= 3,
    edit: (s) => ({ ...clone(s), n95Outdoors: true }),
    cost: 1, effort: 1,
    audience: ["adult", "senior", "child", "respiratory", "cardiac", "pregnant"],
    i18nKey: "action.n95_transport",
    method: "N95 residual penetration factor applied to open-transport exposure",
    assumptions: ["N95 fit factor ~0.2 (base), range 0.1–0.4"],
  },
  {
    id: "commute_to_public_transport",
    section: "routine",
    appliesIf: (p) => ["car", "two_wheeler", "auto"].includes(p.commute.mode),
    edit: (s) => ({ ...clone(s), commuteMode: "bus" as CommuteMode }),
    co2eKgPerYear: (p) => co2ePerYear(p.commute.km, p.commute.daysPerWeek, p.commute.mode, "bus"),
    cost: 0, effort: 3,
    audience: ["adult"],
    i18nKey: "action.commute_public",
    method: "Exposure: open-transport vs car cabin (0.6× outdoor). CO₂e: emission factor difference × annual km",
    assumptions: ["Car cabin 0.6× outdoor PM2.5", "Bus 1.0× outdoor"],
  },
  {
    id: "wfh_on_worst_day",
    section: "routine",
    appliesIf: (p, _c, level) => p.commute.mode !== "wfh" && p.commute.daysPerWeek >= 3 && level >= 4,
    edit: (s) => ({ ...clone(s), commuteMode: "wfh" as CommuteMode, commuteDaysPerWeek: s.commuteDaysPerWeek - 1 }),
    co2eKgPerYear: (p) => co2ePerYear(p.commute.km, 1, p.commute.mode, "wfh"),
    cost: 0, effort: 2,
    audience: ["adult"],
    i18nKey: "action.wfh_worst",
    method: "Eliminate commute exposure for 1 day/week on worst days",
    assumptions: ["WFH feasibility assumed"],
  },
  {
    id: "no_idling",
    section: "routine",
    appliesIf: (p) => ["car", "two_wheeler"].includes(p.commute.mode) || p.habits.schoolRun,
    co2eKgPerYear: () => {
      const [low, high] = idlingRange();
      return (low + high) / 2;
    },
    cost: 0, effort: 1,
    audience: ["adult"],
    i18nKey: "action.no_idling",
    method: "Idling: 0.6–1.0 L/h petrol × 5 min/day × 250 days × 2.3 kg CO₂/L",
    assumptions: ["5 min idling/day", "Petrol vehicle"],
  },
  {
    id: "errands_in_best_window",
    section: "routine",
    appliesIf: () => true,
    cost: 0, effort: 1,
    audience: ["adult", "senior"],
    i18nKey: "action.errands_window",
  },
  {
    id: "child_play_indoors_when_poor",
    section: "routine",
    appliesIf: (p, _c, level) => p.household.children > 0 && level >= 3,
    cost: 0, effort: 1,
    audience: ["child"],
    i18nKey: "action.child_indoors",
  },
  {
    id: "trip_chaining",
    section: "routine",
    appliesIf: (p) => ["car", "two_wheeler"].includes(p.commute.mode),
    co2eKgPerYear: (p) => {
      const [low, high] = tripChainingRange(p.commute.km, p.commute.daysPerWeek, p.commute.mode);
      return (low + high) / 2;
    },
    cost: 0, effort: 2,
    audience: ["adult"],
    i18nKey: "action.trip_chaining",
    method: "Combine errands to reduce 10% of km (range 5–15%)",
    assumptions: ["10% km reduction midpoint"],
  },

  // === INDOOR ===
  {
    id: "air_house_in_best_window",
    section: "indoor",
    appliesIf: (p, _c, level) => p.home.windows !== "sealed" && level >= 2,
    edit: (s, c) => ({ ...clone(s), windowsOpenHours: bestWindowHours(c.hours, c.nowIndex) }),
    cost: 0, effort: 1,
    audience: ["adult", "senior", "child", "respiratory", "cardiac", "pregnant"],
    i18nKey: "action.air_best_window",
    method: "Open windows during lowest PM2.5 hours only",
    assumptions: ["Windows open: air exchange 4.0 h⁻¹"],
  },
  {
    id: "close_windows_at_peak",
    section: "indoor",
    appliesIf: (p) => p.home.windows !== "sealed",
    edit: (s, c) => {
      const avoid = avoidWindowHours(c.hours, c.nowIndex);
      return { ...clone(s), windowsOpenHours: s.windowsOpenHours.filter((h) => !avoid.includes(h)) };
    },
    cost: 0, effort: 1,
    audience: ["adult", "senior", "child", "respiratory", "cardiac", "pregnant"],
    i18nKey: "action.close_peak",
    method: "Close windows during highest PM2.5 hours",
    assumptions: [],
  },
  {
    id: "run_purifier_through_night",
    section: "indoor",
    appliesIf: (p) => p.home.purifier !== "none",
    edit: (s) => ({
      ...clone(s),
      purifierHours: Array.from({ length: 24 }, (_, i) => i),
    }),
    cost: 0, effort: 1,
    audience: ["adult", "senior", "child", "respiratory", "cardiac", "pregnant"],
    i18nKey: "action.purifier_night",
    method: "Extend purifier run to all home hours (from baseline 18–22)",
    assumptions: ["Purifier derate 0.5 (base)"],
  },
  {
    id: "diy_box_fan_filter",
    section: "indoor",
    appliesIf: (p) => p.home.purifier === "none" && (p.budget === "zero" || p.budget === "low"),
    edit: (s) => ({
      ...clone(s),
      purifier: "diy" as const,
      purifierHours: Array.from({ length: 24 }, (_, i) => i),
    }),
    cost: 1, effort: 2,
    audience: ["adult", "senior", "child", "respiratory", "cardiac", "pregnant"],
    i18nKey: "action.diy_filter",
    method: "DIY box-fan filter CADR ~200 m³/h, derated 0.5",
    assumptions: ["DIY CADR 200 m³/h (conservative)"],
  },
  {
    id: "buy_hepa_purifier",
    section: "indoor",
    appliesIf: (p) => p.home.purifier === "none" && p.budget === "medium",
    edit: (s) => ({
      ...clone(s),
      purifier: "hepa" as const,
      purifierHours: Array.from({ length: 24 }, (_, i) => i),
    }),
    cost: 2, effort: 1,
    audience: ["adult", "senior", "child", "respiratory", "cardiac", "pregnant"],
    i18nKey: "action.hepa_purifier",
    method: "HEPA purifier CADR ~250 m³/h, derated 0.5",
    assumptions: ["HEPA CADR 250 m³/h"],
  },
  {
    id: "seal_gaps_and_door_sweeps",
    section: "indoor",
    appliesIf: (p) => p.home.windows === "leaky",
    edit: (s) => ({ ...clone(s), envelope: "normal" as const }),
    cost: 1, effort: 2,
    audience: ["adult", "senior", "child", "respiratory", "cardiac", "pregnant"],
    i18nKey: "action.seal_gaps",
    method: "Reduce air exchange from leaky (2.0 h⁻¹) to normal (0.7 h⁻¹)",
    assumptions: ["Leaky = 2.0, Normal = 0.7 air exchanges/h"],
  },
  {
    id: "cooking_ventilation",
    section: "indoor",
    appliesIf: (p) => ["lpg", "biomass", "other"].includes(p.home.cooking),
    edit: (s) => ({ ...clone(s), cookVent: true }),
    cost: 0, effort: 1,
    audience: ["adult"],
    i18nKey: "action.cook_vent",
    method: "Kitchen exhaust halves cooking source term",
    assumptions: ["Vent effectiveness 50%"],
  },
  {
    id: "damp_mop_dont_sweep",
    section: "indoor",
    appliesIf: () => true,
    cost: 0, effort: 1,
    audience: ["adult"],
    i18nKey: "action.damp_mop",
  },
  {
    id: "avoid_indoor_smoke_sources",
    section: "indoor",
    appliesIf: () => true,
    cost: 0, effort: 1,
    audience: ["adult"],
    i18nKey: "action.no_smoke",
  },

  // === SWAP ===
  {
    id: "lpg_instead_of_biomass",
    section: "swap",
    appliesIf: (p) => p.home.cooking === "biomass",
    edit: (s) => ({ ...clone(s), cooking: "lpg" as const }),
    cost: 1, effort: 2,
    audience: ["adult"],
    i18nKey: "action.lpg_cooking",
    method: "Replace biomass (S=60) with LPG (S=10)",
    assumptions: ["Biomass source 60, LPG 10 µg/m³/h"],
  },
  {
    id: "induction_cooking",
    section: "swap",
    appliesIf: (p) => p.home.cooking === "lpg",
    edit: (s) => ({ ...clone(s), cooking: "induction" as const }),
    cost: 2, effort: 2,
    audience: ["adult"],
    i18nKey: "action.induction",
    method: "Replace LPG (S=10) with induction (S=0)",
    assumptions: ["LPG source 10, Induction 0 µg/m³/h"],
  },
  {
    id: "warmth_without_burning",
    section: "swap",
    appliesIf: (_p, _c, level) => level >= 2,
    cost: 1, effort: 1,
    audience: ["adult", "senior", "child"],
    i18nKey: "action.warmth_safe",
  },
  {
    id: "carpool_shared_ride",
    section: "swap",
    appliesIf: (p) => p.commute.mode === "car",
    co2eKgPerYear: (p) =>
      co2ePerYear(p.commute.km, p.commute.daysPerWeek, "car", "car") * 0.5, // half the car emissions
    cost: 0, effort: 2,
    audience: ["adult"],
    i18nKey: "action.carpool",
    method: "Share car: halve per-person CO₂e",
    assumptions: ["2 persons per car"],
  },
  {
    id: "walk_or_cycle_short_trips",
    section: "swap",
    appliesIf: (p, _c, level) => p.commute.km <= 3 && level <= 2,
    edit: (s) => ({ ...clone(s), commuteMode: "walk" as CommuteMode }),
    co2eKgPerYear: (p) => co2ePerYear(p.commute.km, p.commute.daysPerWeek, p.commute.mode, "walk"),
    cost: 0, effort: 2,
    audience: ["adult"],
    i18nKey: "action.walk_cycle",
    method: "Walk/cycle short trips: zero emissions but higher breathing exposure outdoors",
    assumptions: ["Walking breathing factor 2.0×, cycling 3.0×"],
  },
  {
    id: "community_no_burning",
    section: "swap",
    appliesIf: () => true,
    cost: 0, effort: 1,
    audience: ["adult"],
    i18nKey: "action.no_burning",
  },
  {
    id: "society_dust_and_diesel_audit",
    section: "swap",
    appliesIf: () => true,
    cost: 0, effort: 3,
    audience: ["adult"],
    i18nKey: "action.dust_diesel",
  },
  {
    id: "share_community_brief",
    section: "swap",
    appliesIf: () => true,
    cost: 0, effort: 1,
    audience: ["adult"],
    i18nKey: "action.share_brief",
  },
];

/** Lookup by id */
export function getAction(id: string): ActionDef | undefined {
  return CATALOG.find((a) => a.id === id);
}
