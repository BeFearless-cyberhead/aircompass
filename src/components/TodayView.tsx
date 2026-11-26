"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useAirCompass } from "./AirCompassProvider";
import { aqiFromPm25, levelOfPm25 } from "@/lib/engine/bands";
import { naqi } from "@/lib/engine/naqi";
import { findBestWindow, findAvoidWindow } from "@/lib/engine/window";
import guidanceData from "../../data/guidance.json";
import type { Level } from "@/lib/types";

const LEVEL_ICONS: Record<Level, string> = {
  0: "●",
  1: "◐",
  2: "▲",
  3: "◆",
  4: "■",
  5: "⬢",
};

const LEVEL_BADGE_CLASSES: Record<Level, string> = {
  0: "bg-emerald-100 text-emerald-900 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-200 dark:border-emerald-800",
  1: "bg-lime-100 text-lime-900 border-lime-300 dark:bg-lime-950 dark:text-lime-200 dark:border-lime-800",
  2: "bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950 dark:text-amber-200 dark:border-amber-800",
  3: "bg-orange-100 text-orange-900 border-orange-300 dark:bg-orange-950 dark:text-orange-200 dark:border-orange-800",
  4: "bg-rose-100 text-rose-900 border-rose-300 dark:bg-rose-950 dark:text-rose-200 dark:border-rose-800",
  5: "bg-purple-100 text-purple-900 border-purple-300 dark:bg-purple-950 dark:text-purple-200 dark:border-purple-800",
};

export function TodayView() {
  const { profile, context, loading, calibrationFactor, setCalibrationReading, loadSampleFamily, t, lang } =
    useAirCompass();
  const [showTable, setShowTable] = useState(false);
  const [calInput, setCalInput] = useState("");

  const hours = context.hours;
  const nowHour = hours[context.nowIndex] ?? hours[0];
  const nowPm25 = nowHour?.pm25 ?? 0;
  const nowAqi = aqiFromPm25(nowPm25);
  const nowLevel = levelOfPm25(nowPm25);

  const next24 = hours.slice(context.nowIndex, context.nowIndex + 24);
  const meanPm25 =
    next24.length > 0 ? next24.reduce((a, b) => a + b.pm25, 0) / next24.length : nowPm25;
  const todayAqi = aqiFromPm25(meanPm25);
  const todayLevel = levelOfPm25(meanPm25);

  // Trailing 24h for NAQI when country === "IN"
  const isIndia = (profile?.place.country ?? context.place.country) === "IN";
  const trailingStart = Math.max(0, context.nowIndex - 23);
  const trailing24 = hours.slice(trailingStart, context.nowIndex + 1);
  const naqiSufficient = trailing24.length >= 16;
  const naqiResult = naqiSufficient
    ? naqi(
        trailing24.reduce((a, b) => a + b.pm25, 0) / trailing24.length,
        trailing24.reduce((a, b) => a + b.pm10, 0) / trailing24.length,
      )
    : null;

  // Map next 24h by clock hour for window finder
  const byClockHour = Array(24).fill(meanPm25) as number[];
  for (const h of next24) {
    const hr = Number(h.t.slice(11, 13));
    if (Number.isInteger(hr) && hr >= 0 && hr < 24) byClockHour[hr] = h.pm25;
  }
  const bestWin = findBestWindow(byClockHour);
  const avoidWin = findAvoidWindow(byClockHour);
  const bestWinLevel = bestWin ? levelOfPm25(bestWin.mean) : todayLevel;

  const guide = guidanceData.guidance.find((g) => g.level === todayLevel) ?? guidanceData.guidance[0];
  const guidance = guide[lang];

  // SVG Chart dimensions
  const chartW = 640;
  const chartH = 180;
  const maxVal = Math.max(100, ...next24.map((h) => h.pm25));
  const whoY = chartH - (15 / maxVal) * (chartH - 20) - 10;

  return (
    <div className="space-y-6">
      {!profile && (
        <section aria-labelledby="landing-heading" className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
          <h1 id="landing-heading" className="text-2xl sm:text-3xl font-bold tracking-tight">
            {t("app.subtitle")}
          </h1>
          <p className="text-slate-600 dark:text-slate-300 max-w-2xl">
            {t("app.tagline")}
          </p>
          <div className="flex flex-wrap gap-3 pt-2">
            <button
              type="button"
              onClick={() => void loadSampleFamily()}
              data-testid="sample-family-btn"
              disabled={loading}
              className="min-h-[44px] px-5 py-2.5 rounded-xl bg-teal-700 text-white font-semibold hover:bg-teal-800 disabled:opacity-50"
            >
              {loading ? t("app.loading") : t("app.sample_family")}
            </button>
            <Link
              href="/setup"
              className="min-h-[44px] px-5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 font-semibold flex items-center hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              {t("app.setup_cta")}
            </Link>
          </div>
        </section>
      )}

      {profile && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-2xl font-bold tracking-tight">
            {t("nav.today")} — {profile.place.name}
          </h1>
          <Link
            href="/plan"
            className="min-h-[44px] px-4 py-2 rounded-xl bg-teal-700 text-white text-sm font-semibold flex items-center hover:bg-teal-800"
          >
            {t("nav.plan")} →
          </Link>
        </div>
      )}

      {/* AQI Hero */}
      <section aria-label={t("today.today_level")} className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2">
          <div className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
            {t("today.today_level")} ({t("today.aqi_label")})
          </div>
          <div className="text-4xl font-extrabold tabular-nums">{todayAqi}</div>
          <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-semibold border ${LEVEL_BADGE_CLASSES[todayLevel]}`}>
            <span aria-hidden="true">{LEVEL_ICONS[todayLevel]}</span>
            <span>{t(`levels.${todayLevel}`)}</span>
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400">
            {t("today.pm25_24h_mean", { value: Math.round(meanPm25) })}
            {calibrationFactor !== 1 && ` ${t("today.calibrated", { factor: calibrationFactor })}`}
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2">
          <div className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
            {t("today.now")} ({nowHour?.t.slice(11, 16) ?? "--:--"})
          </div>
          <div className="text-4xl font-extrabold tabular-nums">{nowAqi}</div>
          <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-semibold border ${LEVEL_BADGE_CLASSES[nowLevel]}`}>
            <span aria-hidden="true">{LEVEL_ICONS[nowLevel]}</span>
            <span>{t(`levels.${nowLevel}`)}</span>
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400">
            {t("today.pm25_value", { value: Math.round(nowPm25) })} ·{" "}
            {t("today.provider_aqi", { value: Math.round(nowHour?.usAqi ?? nowAqi) })}
          </div>
        </div>

        {isIndia && (
          <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2">
            <div className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
              {t("today.naqi_label")} · {t("today.naqi_last_24h")}
            </div>
            {naqiResult ? (
              <>
                <div className="text-4xl font-extrabold tabular-nums">{naqiResult.index}</div>
                <div className="inline-block px-3 py-1 rounded-full text-sm font-semibold bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700">
                  {t(`naqi.categories.${naqiResult.category}`)}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  {t("today.dominant", { value: naqiResult.dominant.toUpperCase() })}
                </div>
              </>
            ) : (
              <p className="text-sm text-slate-500 dark:text-slate-400">{t("today.insufficient_data")}</p>
            )}
          </div>
        )}
      </section>

      {/* Windows strip */}
      <section aria-label={t("today.next_24h")} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="p-4 rounded-xl bg-teal-50 dark:bg-teal-950/40 border border-teal-200 dark:border-teal-800">
          <div className="text-xs font-semibold uppercase text-teal-800 dark:text-teal-300">
            {t("today.go_out")}
          </div>
          <div className="text-lg font-bold mt-1">
            {bestWinLevel >= 4
              ? t("today.no_good_window")
              : bestWin
                ? t("today.best_window", { start: `${bestWin.start}:00`, end: `${bestWin.end}:00` })
                : "--"}
          </div>
          {bestWin && (
            <div className="text-xs text-teal-700 dark:text-teal-400 mt-1">
              {t("today.mean_pm25", { value: Math.round(bestWin.mean) })}
            </div>
          )}
        </div>

        {/* Calm days must not show an "avoid" box: no alarm copy at L0–L1 (§8.4 I10). */}
        {todayLevel >= 2 && (
          <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800">
            <div className="text-xs font-semibold uppercase text-rose-800 dark:text-rose-300">
              {t("today.avoid")}
            </div>
            <div className="text-lg font-bold mt-1">
              {avoidWin
                ? t("today.avoid_window", { start: `${avoidWin.start}:00`, end: `${avoidWin.end}:00` })
                : "--"}
            </div>
            {avoidWin && (
              <div className="text-xs text-rose-700 dark:text-rose-400 mt-1">
                {t("today.mean_pm25", { value: Math.round(avoidWin.mean) })}
              </div>
            )}
          </div>
        )}
      </section>

      {/* Hourly 24h SVG chart + accessible table toggle */}
      <section className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">{t("today.next_24h")} (PM2.5 µg/m³)</h2>
          <button
            type="button"
            onClick={() => setShowTable((v) => !v)}
            className="min-h-[44px] px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            {showTable ? t("today.show_chart") : t("today.show_table")}
          </button>
        </div>

        {!showTable ? (
          <div className="overflow-x-auto">
            <svg
              role="img"
              aria-label={t("today.chart_aria", { mean: Math.round(meanPm25) })}
              viewBox={`0 0 ${chartW} ${chartH}`}
              className="w-full max-w-full h-44"
            >
              <title>{t("today.chart_title")}</title>
              <desc>{t("today.chart_desc")}</desc>
              {next24.map((h, i) => {
                const barW = (chartW - 20) / Math.max(next24.length, 1);
                const hPx = Math.max(2, (h.pm25 / maxVal) * (chartH - 30));
                const x = 10 + i * barW;
                const y = chartH - 20 - hPx;
                const lv = levelOfPm25(h.pm25);
                const fill =
                  lv <= 1 ? "#0d9488" : lv === 2 ? "#d97706" : lv === 3 ? "#ea580c" : "#be123c";
                return (
                  <g key={h.t}>
                    <rect x={x + 1} y={y} width={Math.max(2, barW - 3)} height={hPx} fill={fill} rx="2" />
                    {i % 4 === 0 && (
                      <text x={x + 2} y={chartH - 4} fontSize="10" fill="#64748b">
                        {h.t.slice(11, 13)}
                      </text>
                    )}
                  </g>
                );
              })}
              {/* WHO 15 ug/m3 reference line */}
              <line
                x1="10"
                y1={whoY}
                x2={chartW - 10}
                y2={whoY}
                stroke="#0f766e"
                strokeWidth="1.5"
                strokeDasharray="4 4"
              />
              <text x="14" y={Math.max(12, whoY - 4)} fontSize="10" fill="#0f766e">
                {t("today.who_ref")}
              </text>
            </svg>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700">
                  <th className="py-2 pr-4">{t("today.time")}</th>
                  <th className="py-2 pr-4">{t("today.pm25")}</th>
                  <th className="py-2 pr-4">{t("today.us_aqi")}</th>
                  <th className="py-2">{t("today.level")}</th>
                </tr>
              </thead>
              <tbody>
                {next24.map((h) => {
                  const lv = levelOfPm25(h.pm25);
                  return (
                    <tr key={h.t} className="border-b border-slate-100 dark:border-slate-800">
                      <td className="py-1.5 pr-4">{h.t.slice(11, 16)}</td>
                      <td className="py-1.5 pr-4 tabular-nums">{Math.round(h.pm25)}</td>
                      <td className="py-1.5 pr-4 tabular-nums">{aqiFromPm25(h.pm25)}</td>
                      <td className="py-1.5">{t(`levels.${lv}`)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Guidance & Per-member chips */}
      <section className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3">
        <h2 className="text-lg font-semibold">{t("today.health_guidance")}</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60">
            <div className="font-semibold mb-1">{t("today.everyone_label")}</div>
            <p>{guidance.everyone}</p>
          </div>
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60">
            <div className="font-semibold mb-1">{t("today.sensitive_label")}</div>
            <p>{guidance.sensitive}</p>
          </div>
        </div>
        {profile && (
          <div className="flex flex-wrap gap-2 pt-1">
            <span className="px-3 py-1 rounded-full text-xs font-medium bg-slate-100 dark:bg-slate-800">
              {t("today.adults_count", { count: profile.household.adults })}
            </span>
            {profile.household.children > 0 && (
              <span className="px-3 py-1 rounded-full text-xs font-medium bg-amber-100 dark:bg-amber-900/50 text-amber-900 dark:text-amber-200">
                {t("today.children_count", { count: profile.household.children })}
              </span>
            )}
            {profile.household.seniors > 0 && (
              <span className="px-3 py-1 rounded-full text-xs font-medium bg-amber-100 dark:bg-amber-900/50 text-amber-900 dark:text-amber-200">
                {t("today.seniors_count", { count: profile.household.seniors })}
              </span>
            )}
            {profile.household.conditions.map((c) => (
              <span key={c} className="px-3 py-1 rounded-full text-xs font-medium bg-rose-100 dark:bg-rose-900/50 text-rose-900 dark:text-rose-200">
                {t(`groups.${c}`)}
              </span>
            ))}
          </div>
        )}
      </section>

      {/* Local calibration */}
      <section className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-wrap items-center gap-3">
        <label htmlFor="cal-input" className="text-sm font-medium">
          {t("today.calibrate_label")}
        </label>
        <input
          id="cal-input"
          type="number"
          min="1"
          max="1000"
          value={calInput}
          onChange={(e) => setCalInput(e.target.value)}
          placeholder={t("today.calibrate_placeholder")}
          className="min-h-[44px] w-28 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent text-sm"
        />
        <button
          type="button"
          onClick={() => setCalibrationReading(calInput ? Number(calInput) : null)}
          className="min-h-[44px] px-4 py-1.5 rounded-lg bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900 text-sm font-medium"
        >
          {t("today.apply")}
        </button>
        {calibrationFactor !== 1 && (
          <button
            type="button"
            onClick={() => {
              setCalInput("");
              setCalibrationReading(null);
            }}
            className="min-h-[44px] px-3 py-1.5 text-xs underline"
          >
            {t("today.reset_calibration", { factor: calibrationFactor })}
          </button>
        )}
      </section>
    </div>
  );
}
