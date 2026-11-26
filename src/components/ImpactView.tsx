"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import { useAirCompass } from "./AirCompassProvider";
import { computeExposure } from "@/lib/engine/exposure";
import { co2ePerYear, communityImpact } from "@/lib/engine/emissions";
import { buildBaselineScenario } from "@/lib/engine/baseline";
import { findBestWindow } from "@/lib/engine/window";
import { BASE } from "@/lib/engine/sensitivity";
import type { CommuteMode, Scenario } from "@/lib/types";

export function ImpactView() {
  const { profile, context, loadSampleFamily, t } = useAirCompass();

  const [purifier, setPurifier] = useState<"none" | "diy" | "hepa">(profile?.home.purifier ?? "hepa");
  const [n95Outdoors, setN95Outdoors] = useState(true);
  const [windowMode, setWindowMode] = useState<"baseline" | "best_only" | "shut">("best_only");
  const [commuteMode, setCommuteMode] = useState<CommuteMode>(profile?.commute.mode ?? "car");
  const [commuteDays, setCommuteDays] = useState(profile?.commute.daysPerWeek ?? 5);
  const [cookVent, setCookVent] = useState(true);
  const [households, setHouseholds] = useState(50);

  const baselineScenario = useMemo(
    () => (profile ? buildBaselineScenario(profile) : null),
    [profile],
  );

  const bestWindowHours = useMemo(() => {
    const next24 = context.hours.slice(context.nowIndex, context.nowIndex + 24);
    const byHour = Array(24).fill(next24[0]?.pm25 ?? 100) as number[];
    for (const h of next24) {
      const hr = Number(h.t.slice(11, 13));
      if (Number.isInteger(hr) && hr >= 0 && hr < 24) byHour[hr] = h.pm25;
    }
    const w = findBestWindow(byHour);
    return w ? [w.start, w.start + 1] : [12, 13];
  }, [context]);

  if (!profile || !baselineScenario) {
    return (
      <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
        <h1 className="text-2xl font-bold">{t("impact.title")}</h1>
        <p className="text-slate-600 dark:text-slate-300">{t("impact.empty_body")}</p>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => void loadSampleFamily()}
            className="min-h-[44px] px-5 py-2.5 rounded-xl bg-teal-700 text-white font-semibold"
          >
            {t("app.sample_family")}
          </button>
          <Link
            href="/setup"
            className="min-h-[44px] px-5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 font-semibold flex items-center"
          >
            {t("app.setup_cta")}
          </Link>
        </div>
      </div>
    );
  }

  const modifiedScenario: Scenario = {
    ...baselineScenario,
    purifier,
    purifierHours: purifier !== "none" ? Array.from({ length: 24 }, (_, i) => i) : [],
    n95Outdoors,
    windowsOpenHours:
      windowMode === "shut"
        ? []
        : windowMode === "best_only"
          ? bestWindowHours
          : baselineScenario.windowsOpenHours,
    commuteMode,
    commuteDaysPerWeek: commuteDays,
    cookVent,
  };

  const beforeExp = computeExposure(profile, baselineScenario, context.hours, context.nowIndex, BASE);
  const afterExp = computeExposure(profile, modifiedScenario, context.hours, context.nowIndex, BASE);
  const deltaExp = beforeExp - afterExp;
  const pctExp = beforeExp > 0 ? Math.round((deltaExp / beforeExp) * 100) : 0;

  const annualCo2e = Math.max(
    0,
    co2ePerYear(profile.commute.km, profile.commute.daysPerWeek, profile.commute.mode, profile.commute.mode) +
      (co2ePerYear(profile.commute.km, profile.commute.daysPerWeek, profile.commute.mode, commuteMode) +
        co2ePerYear(
          profile.commute.km,
          Math.max(0, profile.commute.daysPerWeek - commuteDays),
          commuteMode,
          "wfh",
        )),
  );
  const societyCo2e = Math.round(communityImpact(households, annualCo2e));

  const maxBar = Math.max(beforeExp, afterExp, 1);
  const beforeW = Math.round((beforeExp / maxBar) * 260);
  const afterW = Math.round((afterExp / maxBar) * 260);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">{t("impact.title")}</h1>

      {/* Before / After hero */}
      <section className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
          <div>
            <div className="text-sm text-slate-500 dark:text-slate-400">{t("impact.hero_before")}</div>
            <div className="text-3xl sm:text-4xl font-extrabold tabular-nums" data-testid="impact-hero">
              {Math.round(beforeExp)} → {Math.round(afterExp)} µg/m³
            </div>
            <div className="text-sm font-semibold text-teal-700 dark:text-teal-400 mt-1">
              {deltaExp >= 0
                ? t("impact.cleaner", { pct: pctExp, value: Math.round(deltaExp) })
                : t("impact.higher", { pct: Math.abs(pctExp), value: Math.abs(Math.round(deltaExp)) })}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-2">
              {t("impact.cigarette", {
                before: (beforeExp / 22).toFixed(1),
                after: (afterExp / 22).toFixed(1),
              })}
            </div>
          </div>

          <svg
            role="img"
            aria-label={t("impact.before_after_aria", {
              before: Math.round(beforeExp),
              after: Math.round(afterExp),
            })}
            width="300"
            height="80"
            className="w-full max-w-[300px]"
          >
            <title>{t("impact.before_after_title")}</title>
            <text x="0" y="14" fontSize="11" fill="#64748b">
              {t("plan.exposure_before")} ({Math.round(beforeExp)})
            </text>
            <rect x="0" y="20" width={beforeW} height="16" fill="#94a3b8" rx="3" />
            <text x="0" y="54" fontSize="11" fill="#0f766e">
              {t("plan.exposure_after")} ({Math.round(afterExp)})
            </text>
            <rect x="0" y="60" width={afterW} height="16" fill="#0d9488" rx="3" />
          </svg>
        </div>
      </section>

      {/* What-if controls */}
      <section className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
        <h2 className="text-lg font-bold">{t("impact.what_if")}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <label htmlFor="whatif-purifier" className="block text-sm font-medium mb-1">
              {t("impact.purifier_toggle")}
            </label>
            <select
              id="whatif-purifier"
              value={purifier}
              onChange={(e) => setPurifier(e.target.value as "none" | "diy" | "hepa")}
              className="w-full min-h-[44px] px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
            >
              <option value="none">{t("setup.none")}</option>
              <option value="diy">{t("setup.diy")}</option>
              <option value="hepa">{t("setup.hepa")}</option>
            </select>
          </div>

          <div>
            <label htmlFor="whatif-windows" className="block text-sm font-medium mb-1">
              {t("impact.window_schedule")}
            </label>
            <select
              id="whatif-windows"
              value={windowMode}
              onChange={(e) => setWindowMode(e.target.value as "baseline" | "best_only" | "shut")}
              className="w-full min-h-[44px] px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
            >
              <option value="baseline">{t("impact.baseline_habits")}</option>
              <option value="best_only">{t("impact.best_window_only")}</option>
              <option value="shut">{t("impact.keep_shut")}</option>
            </select>
          </div>

          <div>
            <label htmlFor="whatif-commute" className="block text-sm font-medium mb-1">
              {t("setup.mode")}
            </label>
            <select
              id="whatif-commute"
              value={commuteMode}
              onChange={(e) => setCommuteMode(e.target.value as CommuteMode)}
              className="w-full min-h-[44px] px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
            >
              {(["car", "two_wheeler", "auto", "bus", "metro", "walk", "cycle", "wfh"] as const).map((m) => (
                <option key={m} value={m}>
                  {t(`setup.${m}`)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="whatif-days" className="block text-sm font-medium mb-1">
              {t("impact.commute_days")}: {commuteDays}
            </label>
            <input
              id="whatif-days"
              type="range"
              min={0}
              max={7}
              value={commuteDays}
              onChange={(e) => setCommuteDays(Number(e.target.value))}
              className="w-full min-h-[44px]"
            />
          </div>

          <div className="flex items-center">
            <label className="inline-flex items-center gap-2 min-h-[44px] cursor-pointer">
              <input
                type="checkbox"
                checked={n95Outdoors}
                onChange={(e) => setN95Outdoors(e.target.checked)}
                className="w-4 h-4"
              />
              <span className="text-sm font-medium">{t("impact.mask_toggle")}</span>
            </label>
          </div>

          <div className="flex items-center">
            <label className="inline-flex items-center gap-2 min-h-[44px] cursor-pointer">
              <input
                type="checkbox"
                checked={cookVent}
                onChange={(e) => setCookVent(e.target.checked)}
                className="w-4 h-4"
              />
              <span className="text-sm font-medium">{t("impact.cooking_vent")}</span>
            </label>
          </div>
        </div>
      </section>

      {/* Community multiplier */}
      <section className="p-6 rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 space-y-3">
        <h2 className="text-lg font-bold">{t("impact.community")}</h2>
        <div className="flex flex-wrap items-center gap-4">
          <label htmlFor="society-slider" className="text-sm font-medium">
            {t("impact.community_desc", { count: households })}:
          </label>
          <input
            id="society-slider"
            type="range"
            min={5}
            max={500}
            step={5}
            value={households}
            onChange={(e) => setHouseholds(Number(e.target.value))}
            className="w-48 min-h-[44px]"
          />
        </div>
        <div className="text-2xl font-extrabold text-emerald-800 dark:text-emerald-300 tabular-nums">
          {societyCo2e.toLocaleString()} {t("impact.per_year")}
        </div>
      </section>
    </div>
  );
}
