/** Core types for AirCompass. Frozen: change only by agreement (see plan.md §4). */

export type Lang = "en" | "hi";
export type Group = "child" | "senior" | "respiratory" | "cardiac" | "pregnant" | "adult";
export type CommuteMode = "walk" | "cycle" | "two_wheeler" | "auto" | "bus" | "metro" | "car" | "wfh";
export type Level = 0 | 1 | 2 | 3 | 4 | 5;

export interface Profile {
  lang: Lang;
  place: { name: string; lat: number; lon: number; country: string };
  household: {
    adults: number;
    children: number;
    seniors: number;
    conditions: ("respiratory" | "cardiac" | "pregnant")[];
  };
  home: {
    type: "apartment" | "house";
    windows: "sealed" | "normal" | "leaky";
    ac: boolean;
    purifier: "none" | "hepa" | "diy";
    cooking: "lpg" | "induction" | "biomass" | "other";
    roomAreaM2: number;
  };
  commute: { mode: CommuteMode; km: number; daysPerWeek: number };
  habits: { morningOutdoorExercise: boolean; schoolRun: boolean };
  budget: "zero" | "low" | "medium";
  notes?: string;
}

export interface HourPoint {
  t: string;
  pm25: number;
  pm10: number;
  usAqi: number;
  tempC?: number;
  rh?: number;
  windKmh?: number;
}

export interface AirContext {
  place: Profile["place"];
  source: "live" | "demo";
  dataNote: "cams_europe_11km" | "cams_global_25_45km" | "recorded" | "illustrative";
  recordedDate?: string;
  fetchedAt: string;
  hours: HourPoint[];
  nowIndex: number;
}

export interface Scenario {
  windowsOpenHours: number[];
  envelope: "sealed" | "normal" | "leaky";
  purifier: "none" | "hepa" | "diy";
  purifierHours: number[];
  exerciseHour: number | null;
  exerciseIndoors: boolean;
  commuteMode: CommuteMode;
  commuteDaysPerWeek: number;
  n95Outdoors: boolean;
  cooking: Profile["home"]["cooking"];
  cookVent: boolean;
}

export interface Impact {
  actionId: string;
  kind: "quantified" | "guidance";
  exposureDeltaUgM3: number;
  exposureDeltaPct: number;
  exposureRangeUgM3: [number, number];
  co2eKgPerYear?: number;
  co2eRangeKgPerYear?: [number, number];
  confidence: "low" | "medium";
  method: string;
  assumptions: string[];
}

/** Engine plan output (deterministic fallback or LLM-generated) */
export interface PlanCard {
  actionId: string;
  title: string;
  why: string;
  when: string;
  steps: string[];
}

export interface Plan {
  headline: string;
  summary: string;
  cards: PlanCard[];
  memberNotes: { group: Group; note: string }[];
  tradeoffs: string[];
}

export type PlanOutcome = "ai" | "repaired" | "fallback";

export interface PlanResult {
  plan: Plan;
  outcome: PlanOutcome;
}

/** Window finder result */
export interface WindowResult {
  start: number;
  end: number;
  mean: number;
}
