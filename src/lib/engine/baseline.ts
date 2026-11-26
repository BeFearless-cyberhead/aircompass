/**
 * Baseline household scenario (§5.4, §5.5).
 *
 * Lives in the engine, not the LLM layer, because the client uses it for what-if
 * calculations. Importing it from `llm/gemini` would pull the Gemini SDK into the
 * browser bundle.
 */
import type { Profile, Scenario } from "../types";

export function buildBaselineScenario(profile: Profile): Scenario {
  // Normal homes open windows 07–09 and 17–19; leaky homes always; sealed never.
  let windowsOpenHours: number[] = [];
  if (profile.home.windows === "normal") windowsOpenHours = [7, 8, 17, 18];
  else if (profile.home.windows === "leaky") {
    windowsOpenHours = Array.from({ length: 24 }, (_, i) => i);
  }

  // Owned purifier runs 18–22 in the baseline (documented assumption).
  const purifierHours = profile.home.purifier !== "none" ? [18, 19, 20, 21] : [];

  return {
    windowsOpenHours,
    envelope: profile.home.windows,
    purifier: profile.home.purifier,
    purifierHours,
    exerciseHour: profile.habits.morningOutdoorExercise ? 6 : null,
    exerciseIndoors: false,
    commuteMode: profile.commute.mode,
    commuteDaysPerWeek: profile.commute.daysPerWeek,
    n95Outdoors: false,
    cooking: profile.home.cooking,
    cookVent: false,
  };
}
