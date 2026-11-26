"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import type { Profile, AirContext, PlanResult, Lang } from "@/lib/types";
import { getDemoContext, SAMPLE_PLACE } from "@/lib/providers/demo";
import enStrings from "@/i18n/en.json";
import hiStrings from "@/i18n/hi.json";

const STORAGE_PROFILE_KEY = "aircompass_profile_v1";
const STORAGE_DEMO_KEY = "aircompass_demo_v1";
const STORAGE_LANG_KEY = "aircompass_lang_v1";

/** Greater Noida sample family (§3.2): 2 adults, 1 child with asthma, 1 grandparent, apartment, car commute. */
export const SAMPLE_FAMILY_PROFILE: Profile = {
  lang: "en",
  place: SAMPLE_PLACE,
  household: {
    adults: 2,
    children: 1,
    seniors: 1,
    conditions: ["respiratory"],
  },
  home: {
    type: "apartment",
    windows: "normal",
    ac: true,
    purifier: "none",
    cooking: "lpg",
    roomAreaM2: 15,
  },
  commute: {
    mode: "car",
    km: 12,
    daysPerWeek: 5,
  },
  habits: {
    morningOutdoorExercise: true,
    schoolRun: true,
  },
  budget: "low",
};

type Dict = typeof enStrings;
const DICTS: Record<Lang, Dict> = {
  en: enStrings,
  hi: hiStrings,
};

interface AirCompassState {
  profile: Profile | null;
  context: AirContext;
  planResult: PlanResult | null;
  lang: Lang;
  demoMode: boolean;
  loading: boolean;
  calibrationFactor: number;
  setLang: (lang: Lang) => void;
  loadSampleFamily: () => Promise<void>;
  saveProfile: (p: Profile) => Promise<void>;
  toggleDemoMode: () => Promise<void>;
  setCalibrationReading: (observedPm25: number | null) => void;
  deleteMyData: () => void;
  t: (path: string, vars?: Record<string, string | number>) => string;
}

const Ctx = createContext<AirCompassState | null>(null);

export function AirCompassProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [context, setContext] = useState<AirContext>(() => getDemoContext());
  const [planResult, setPlanResult] = useState<PlanResult | null>(null);
  const [lang, setLangState] = useState<Lang>("en");
  const [demoMode, setDemoMode] = useState<boolean>(true);
  const [loading, setLoading] = useState<boolean>(false);
  const [calibrationFactor, setCalibrationFactor] = useState<number>(1);
  const [rawContext, setRawContext] = useState<AirContext>(() => getDemoContext());

  const applyCalibration = useCallback((ctx: AirContext, factor: number): AirContext => {
    if (factor === 1) return ctx;
    return {
      ...ctx,
      hours: ctx.hours.map((h) => ({ ...h, pm25: Math.round(h.pm25 * factor * 10) / 10 })),
    };
  }, []);

  const fetchContextAndPlan = useCallback(
    async (p: Profile, useDemo: boolean, factor: number) => {
      setLoading(true);
      try {
        const ctxRes = await fetch("/api/context", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lat: p.place.lat, lon: p.place.lon, demo: useDemo }),
        });
        const baseCtx: AirContext = ctxRes.ok ? await ctxRes.json() : getDemoContext();
        baseCtx.place = p.place;
        setRawContext(baseCtx);
        const calibrated = applyCalibration(baseCtx, factor);
        setContext(calibrated);

        const planRes = await fetch("/api/plan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ profile: p, context: calibrated }),
        });
        if (planRes.ok) {
          const data: PlanResult = await planRes.json();
          setPlanResult(data);
        }
      } catch (err) {
        console.error("Failed to fetch context/plan:", err);
      } finally {
        setLoading(false);
      }
    },
    [applyCalibration],
  );

  // Hydrate from localStorage on mount. This is an external-system sync after hydration:
  // reading storage in a state initialiser would produce an SSR/client mismatch instead.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    try {
      const savedLang = localStorage.getItem(STORAGE_LANG_KEY);
      if (savedLang === "en" || savedLang === "hi") {
        setLangState(savedLang);
        document.documentElement.lang = savedLang;
      }
      const savedDemo = localStorage.getItem(STORAGE_DEMO_KEY);
      const isDemo = savedDemo !== "false";
      setDemoMode(isDemo);

      const savedProfile = localStorage.getItem(STORAGE_PROFILE_KEY);
      if (savedProfile) {
        const parsed = JSON.parse(savedProfile) as Profile;
        setProfile(parsed);
        if (parsed.lang) {
          setLangState(parsed.lang);
          document.documentElement.lang = parsed.lang;
        }
        void fetchContextAndPlan(parsed, isDemo, 1);
      }
    } catch {
      // Ignore storage errors
    }
  }, [fetchContextAndPlan]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const setLang = useCallback(
    (newLang: Lang) => {
      setLangState(newLang);
      document.documentElement.lang = newLang;
      try {
        localStorage.setItem(STORAGE_LANG_KEY, newLang);
      } catch {
        // Ignore
      }
      if (profile) {
        const updated = { ...profile, lang: newLang };
        setProfile(updated);
        try {
          localStorage.setItem(STORAGE_PROFILE_KEY, JSON.stringify(updated));
        } catch {
          // Ignore
        }
        void fetchContextAndPlan(updated, demoMode, calibrationFactor);
      }
    },
    [profile, demoMode, calibrationFactor, fetchContextAndPlan],
  );

  const loadSampleFamily = useCallback(async () => {
    const sample: Profile = { ...SAMPLE_FAMILY_PROFILE, lang };
    setProfile(sample);
    setDemoMode(true);
    try {
      localStorage.setItem(STORAGE_PROFILE_KEY, JSON.stringify(sample));
      localStorage.setItem(STORAGE_DEMO_KEY, "true");
    } catch {
      // Ignore
    }
    await fetchContextAndPlan(sample, true, calibrationFactor);
  }, [lang, calibrationFactor, fetchContextAndPlan]);

  const saveProfile = useCallback(
    async (p: Profile) => {
      const updated = { ...p, lang };
      setProfile(updated);
      try {
        localStorage.setItem(STORAGE_PROFILE_KEY, JSON.stringify(updated));
      } catch {
        // Ignore
      }
      await fetchContextAndPlan(updated, demoMode, calibrationFactor);
    },
    [lang, demoMode, calibrationFactor, fetchContextAndPlan],
  );

  const toggleDemoMode = useCallback(async () => {
    const nextDemo = !demoMode;
    setDemoMode(nextDemo);
    try {
      localStorage.setItem(STORAGE_DEMO_KEY, String(nextDemo));
    } catch {
      // Ignore
    }
    if (profile) {
      await fetchContextAndPlan(profile, nextDemo, calibrationFactor);
    } else {
      const base = getDemoContext();
      setRawContext(base);
      setContext(applyCalibration(base, calibrationFactor));
    }
  }, [demoMode, profile, calibrationFactor, fetchContextAndPlan, applyCalibration]);

  const setCalibrationReading = useCallback(
    (observedPm25: number | null) => {
      if (observedPm25 === null || observedPm25 <= 0) {
        setCalibrationFactor(1);
        setContext(rawContext);
        return;
      }
      const modelledNow = rawContext.hours[rawContext.nowIndex]?.pm25 ?? 1;
      const r = Math.min(3, Math.max(0.5, observedPm25 / Math.max(modelledNow, 1)));
      const rounded = Math.round(r * 100) / 100;
      setCalibrationFactor(rounded);
      setContext(applyCalibration(rawContext, rounded));
    },
    [rawContext, applyCalibration],
  );

  const deleteMyData = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_PROFILE_KEY);
      localStorage.removeItem(STORAGE_DEMO_KEY);
      localStorage.removeItem(STORAGE_LANG_KEY);
    } catch {
      // Ignore
    }
    setProfile(null);
    setPlanResult(null);
    setCalibrationFactor(1);
    const demo = getDemoContext();
    setRawContext(demo);
    setContext(demo);
  }, []);

  const t = useCallback(
    (path: string, vars?: Record<string, string | number>): string => {
      const read = (dict: Dict): string | undefined => {
        let node: unknown = dict;
        for (const part of path.split(".")) {
          if (!node || typeof node !== "object") return undefined;
          node = (node as Record<string, unknown>)[part];
        }
        return typeof node === "string" ? node : undefined;
      };
      let val = read(DICTS[lang]) ?? read(DICTS.en) ?? path;
      if (vars) {
        for (const [k, v] of Object.entries(vars)) {
          val = val.replaceAll(`{{${k}}}`, String(v));
        }
      }
      return val;
    },
    [lang],
  );

  return (
    <Ctx.Provider
      value={{
        profile,
        context,
        planResult,
        lang,
        demoMode,
        loading,
        calibrationFactor,
        setLang,
        loadSampleFamily,
        saveProfile,
        toggleDemoMode,
        setCalibrationReading,
        deleteMyData,
        t,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useAirCompass() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAirCompass must be used inside AirCompassProvider");
  return ctx;
}
