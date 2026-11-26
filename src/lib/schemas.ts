/** Zod schemas for API validation. Strict on every route: no extra fields. */
import { z } from "zod";

export const ACTION_IDS = [
  "shift_exercise_to_best_window",
  "exercise_indoors_when_poor",
  "n95_for_open_transport",
  "commute_to_public_transport",
  "wfh_on_worst_day",
  "no_idling",
  "errands_in_best_window",
  "child_play_indoors_when_poor",
  "trip_chaining",
  "air_house_in_best_window",
  "close_windows_at_peak",
  "run_purifier_through_night",
  "diy_box_fan_filter",
  "buy_hepa_purifier",
  "seal_gaps_and_door_sweeps",
  "cooking_ventilation",
  "damp_mop_dont_sweep",
  "avoid_indoor_smoke_sources",
  "lpg_instead_of_biomass",
  "induction_cooking",
  "warmth_without_burning",
  "carpool_shared_ride",
  "walk_or_cycle_short_trips",
  "community_no_burning",
  "society_dust_and_diesel_audit",
  "share_community_brief",
] as const;

export type ActionId = (typeof ACTION_IDS)[number];

export const GROUPS = ["child", "senior", "respiratory", "cardiac", "pregnant", "adult"] as const;

const ActionIdEnum = z.enum(ACTION_IDS);
const GroupEnum = z.enum(GROUPS);

export const PlanOut = z
  .object({
    headline: z.string().max(120),
    summary: z.string().max(360),
    cards: z
      .array(
        z.object({
          actionId: ActionIdEnum,
          title: z.string().max(80),
          why: z.string().max(240),
          when: z.string().max(120),
          steps: z.array(z.string().max(120)).max(3),
        }),
      )
      .min(5)
      .max(8),
    memberNotes: z
      .array(z.object({ group: GroupEnum, note: z.string().max(200) }))
      .max(5),
    tradeoffs: z.array(z.string().max(200)).max(2),
  })
  .strict();

export const ProfileSchema = z
  .object({
    lang: z.enum(["en", "hi"]),
    place: z.object({
      name: z.string().max(100),
      lat: z.number().min(-90).max(90),
      lon: z.number().min(-180).max(180),
      country: z.string().length(2),
    }),
    household: z.object({
      adults: z.number().int().min(1).max(20),
      children: z.number().int().min(0).max(20),
      seniors: z.number().int().min(0).max(20),
      conditions: z.array(z.enum(["respiratory", "cardiac", "pregnant"])),
    }),
    home: z.object({
      type: z.enum(["apartment", "house"]),
      windows: z.enum(["sealed", "normal", "leaky"]),
      ac: z.boolean(),
      purifier: z.enum(["none", "hepa", "diy"]),
      cooking: z.enum(["lpg", "induction", "biomass", "other"]),
      roomAreaM2: z.number().min(4).max(200),
    }),
    commute: z.object({
      mode: z.enum(["walk", "cycle", "two_wheeler", "auto", "bus", "metro", "car", "wfh"]),
      km: z.number().min(0).max(200),
      daysPerWeek: z.number().int().min(0).max(7),
    }),
    habits: z.object({
      morningOutdoorExercise: z.boolean(),
      schoolRun: z.boolean(),
    }),
    budget: z.enum(["zero", "low", "medium"]),
    notes: z.string().max(300).optional(),
  })
  .strict();

export const HourPointSchema = z
  .object({
    t: z.string().min(10).max(32),
    pm25: z.number().finite().min(0).max(2000),
    pm10: z.number().finite().min(0).max(3000),
    usAqi: z.number().finite().min(0).max(1000),
    tempC: z.number().finite().min(-80).max(70).optional(),
    rh: z.number().finite().min(0).max(100).optional(),
    windKmh: z.number().finite().min(0).max(400).optional(),
  })
  .strict();

export const AirContextSchema = z
  .object({
    place: z.object({
      name: z.string().max(100),
      lat: z.number().min(-90).max(90),
      lon: z.number().min(-180).max(180),
      country: z.string().length(2),
    }),
    source: z.enum(["live", "demo"]),
    dataNote: z.enum(["cams_europe_11km", "cams_global_25_45km", "recorded", "illustrative"]),
    recordedDate: z.string().max(10).optional(),
    fetchedAt: z.string().max(40),
    hours: z.array(HourPointSchema).min(1).max(96),
    nowIndex: z.number().int().min(0).max(95),
  })
  .strict()
  .refine((c) => c.nowIndex < c.hours.length, { message: "nowIndex must point inside hours" });

export const ContextRequestSchema = z
  .object({
    lat: z.number().min(-90).max(90),
    lon: z.number().min(-180).max(180),
    demo: z.boolean().optional(),
  })
  .strict();

export const PlanRequestSchema = z
  .object({
    profile: ProfileSchema,
    context: AirContextSchema,
  })
  .strict();

export const ChatRequestSchema = z
  .object({
    message: z.string().min(1).max(500),
    history: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string() })).max(6).optional(),
    profile: ProfileSchema,
    context: AirContextSchema,
  })
  .strict();

export const ScenarioChangeSchema = z
  .object({
    windowsOpenHours: z.array(z.number().int().min(0).max(23)).optional(),
    purifier: z.enum(["none", "hepa", "diy"]).optional(),
    exerciseHour: z.number().int().min(0).max(23).nullable().optional(),
    exerciseIndoors: z.boolean().optional(),
    commuteMode: z.enum(["walk", "cycle", "two_wheeler", "auto", "bus", "metro", "car", "wfh"]).optional(),
    commuteDaysPerWeek: z.number().int().min(0).max(7).optional(),
    n95Outdoors: z.boolean().optional(),
    cookVent: z.boolean().optional(),
  })
  .strict();
