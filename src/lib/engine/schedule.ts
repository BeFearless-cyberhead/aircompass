/**
 * Schedule engine: builds an hourly activity schedule from a profile.
 * Each hour has sub-slots (fractions) representing what the person does.
 * §5.5: 24 hourly cells with weighted sub-slots.
 */
import type { Profile, Scenario } from "../types";

export type Activity = "sleep" | "home" | "commute" | "outdoor_exercise" | "indoor_exercise" | "work";

export interface SubSlot {
  activity: Activity;
  fraction: number; // fraction of the hour (0..1)
  breathingFactor: number; // v: multiplier on inhalation rate
  concentrationSource: "indoor" | "outdoor" | "car" | "metro" | "openTransport";
}

export interface HourSchedule {
  hour: number;
  slots: SubSlot[];
}

/** Speed assumptions (km/h) for commute duration calculation */
const SPEEDS: Record<string, number> = {
  walk: 4.5,
  cycle: 14,
  two_wheeler: 18,
  auto: 18,
  bus: 18,
  car: 20,
  metro: 30,
  wfh: 0,
};

/** Breathing factors by activity */
const BREATHING: Record<Activity, number> = {
  sleep: 0.8,
  home: 1.0,
  commute: 1.0,
  outdoor_exercise: 4.0,
  indoor_exercise: 2.5,
  work: 1.0,
};

function commuteConcentrationSource(mode: Profile["commute"]["mode"]): SubSlot["concentrationSource"] {
  switch (mode) {
    case "car": return "car";
    case "metro": return "metro";
    case "walk":
    case "cycle":
    case "two_wheeler":
    case "auto":
    case "bus": return "openTransport";
    case "wfh": return "indoor";
  }
}

function commuteBreathingFactor(mode: Profile["commute"]["mode"]): number {
  switch (mode) {
    case "walk": return 2.0;
    case "cycle": return 3.0;
    default: return 1.0;
  }
}

/**
 * Build a 24-hour schedule from a profile and scenario.
 * Sleep 22–06, commute out from ~08:00, back from ~17:00.
 * Exercise at scenario.exerciseHour (default 06:30 if morning habit).
 */
export function buildSchedule(profile: Profile, scenario: Scenario): HourSchedule[] {
  const hours: HourSchedule[] = Array.from({ length: 24 }, (_, i) => ({
    hour: i,
    slots: [],
  }));

  const mode = scenario.commuteMode;
  const speed = SPEEDS[mode] || 20;
  const commuteHours = mode === "wfh" ? 0 : profile.commute.km / speed;

  // Sleep: 22–06
  for (let h = 0; h < 24; h++) {
    if (h >= 22 || h < 6) {
      hours[h].slots.push({
        activity: "sleep",
        fraction: 1,
        breathingFactor: BREATHING.sleep,
        concentrationSource: "indoor",
      });
    }
  }

  // Exercise (06:30 or scenario.exerciseHour)
  if (profile.habits.morningOutdoorExercise || scenario.exerciseHour !== null) {
    const exHour = scenario.exerciseHour ?? 6;
    const isIndoors = scenario.exerciseIndoors;
    const exActivity: Activity = isIndoors ? "indoor_exercise" : "outdoor_exercise";
    // 30 minutes of exercise
    if (exHour >= 0 && exHour < 22) {
      hours[exHour].slots.push({
        activity: exActivity,
        fraction: 0.5,
        breathingFactor: isIndoors ? BREATHING.indoor_exercise : BREATHING.outdoor_exercise,
        concentrationSource: isIndoors ? "indoor" : "outdoor",
      });
      // Fill remaining half with home
      hours[exHour].slots.push({
        activity: "home",
        fraction: 0.5,
        breathingFactor: BREATHING.home,
        concentrationSource: "indoor",
      });
    }
  }

  // Morning commute starting at 08:00
  if (mode !== "wfh" && commuteHours > 0) {
    const commStartHour = 8;
    const fractionOfHour = Math.min(commuteHours, 1);
    if (commStartHour < 22) {
      hours[commStartHour].slots.push({
        activity: "commute",
        fraction: fractionOfHour,
        breathingFactor: commuteBreathingFactor(mode),
        concentrationSource: commuteConcentrationSource(mode),
      });
      if (fractionOfHour < 1) {
        hours[commStartHour].slots.push({
          activity: "work",
          fraction: 1 - fractionOfHour,
          breathingFactor: BREATHING.work,
          concentrationSource: "indoor",
        });
      }
    }

    // Evening commute starting at 17:00
    const commBackHour = 17;
    if (commBackHour < 22) {
      hours[commBackHour].slots.push({
        activity: "commute",
        fraction: fractionOfHour,
        breathingFactor: commuteBreathingFactor(mode),
        concentrationSource: commuteConcentrationSource(mode),
      });
      if (fractionOfHour < 1) {
        hours[commBackHour].slots.push({
          activity: "home",
          fraction: 1 - fractionOfHour,
          breathingFactor: BREATHING.home,
          concentrationSource: "indoor",
        });
      }
    }
  }

  // Work hours: 09–17 (excluding commute hours)
  for (let h = 9; h < 17; h++) {
    if (hours[h].slots.length === 0) {
      hours[h].slots.push({
        activity: mode === "wfh" ? "home" : "work",
        fraction: 1,
        breathingFactor: BREATHING.work,
        concentrationSource: "indoor",
      });
    }
  }

  // Fill remaining empty hours (06, 07, 17-21) with home
  for (let h = 0; h < 24; h++) {
    if (hours[h].slots.length === 0) {
      hours[h].slots.push({
        activity: "home",
        fraction: 1,
        breathingFactor: BREATHING.home,
        concentrationSource: "indoor",
      });
    }
  }

  return hours;
}
