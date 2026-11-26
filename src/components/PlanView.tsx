"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import { useAirCompass } from "./AirCompassProvider";
import { getAction } from "@/lib/engine/catalog";
import { computeImpact } from "@/lib/engine/impact";
import { buildBaselineScenario } from "@/lib/engine/baseline";
import { MYTHS } from "@/lib/engine/myths";

type Tab = "routine" | "indoor" | "swap";

export function PlanView() {
  const { profile, context, planResult, loading, loadSampleFamily, t } = useAirCompass();
  const [tab, setTab] = useState<Tab>("routine");

  const baseline = useMemo(
    () => (profile ? buildBaselineScenario(profile) : null),
    [profile],
  );

  if (!profile) {
    return (
      <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
        <h1 className="text-2xl font-bold">{t("nav.plan")}</h1>
        <p className="text-slate-600 dark:text-slate-300">{t("plan.empty_body")}</p>
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

  const plan = planResult?.plan;
  const outcome = planResult?.outcome ?? "fallback";
  const outcomeBadge =
    outcome === "ai"
      ? t("app.ai_badge")
      : outcome === "repaired"
        ? t("app.repaired_badge")
        : t("app.no_key_badge");

  const cards = (plan?.cards ?? []).filter((c) => {
    const def = getAction(c.actionId);
    return def?.section === tab;
  });

  const displayCards = cards.length > 0 ? cards : plan?.cards ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{plan?.headline ?? t("nav.plan")}</h1>
          {plan?.summary && (
            <p className="text-slate-600 dark:text-slate-300 mt-1">{plan.summary}</p>
          )}
        </div>
        <span data-testid="plan-outcome" className="px-3 py-1 rounded-full text-xs font-semibold bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700">
          {outcomeBadge}
        </span>
      </div>

      <div aria-live="polite" className="sr-only">
        {loading ? t("app.loading") : plan ? t("plan.updated", { count: plan.cards.length }) : ""}
      </div>

      {/* Section tabs */}
      <div role="tablist" aria-label={t("plan.sections_label")} className="flex gap-2 border-b border-slate-200 dark:border-slate-800 pb-2">
        {(["routine", "indoor", "swap"] as const).map((section) => (
          <button
            key={section}
            type="button"
            role="tab"
            aria-selected={tab === section}
            onClick={() => setTab(section)}
            className={`min-h-[44px] px-4 py-2 rounded-lg text-sm font-semibold ${
              tab === section
                ? "bg-teal-700 text-white"
                : "text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
            }`}
          >
            {t(`plan.${section}`)}
          </button>
        ))}
      </div>

      {/* Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {displayCards.map((card) => {
          const def = getAction(card.actionId);
          const impact =
            def && baseline
              ? computeImpact(def, profile, baseline, context.hours, context.nowIndex)
              : null;
          const isTradeoff = impact && impact.exposureDeltaUgM3 < 0;

          return (
            <article
              key={card.actionId}
              data-testid="plan-card"
              className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <h2 className="text-lg font-bold">{card.title}</h2>
                {impact && impact.kind === "quantified" && (
                  <span
                    className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                      isTradeoff
                        ? "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200"
                        : "bg-teal-100 text-teal-900 dark:bg-teal-950 dark:text-teal-200"
                    }`}
                  >
                    {isTradeoff
                      ? `${t("plan.trade_off")}: ${t("plan.tradeoff_delta", { value: Math.abs(Math.round(impact.exposureDeltaUgM3)) })}`
                      : t("plan.improvement", {
                          pct: Math.round(impact.exposureDeltaPct),
                          min: Math.round(impact.exposureRangeUgM3[0]),
                          max: Math.round(impact.exposureRangeUgM3[1]),
                        })}
                  </span>
                )}
              </div>

              <p className="text-sm text-slate-700 dark:text-slate-300">{card.why}</p>
              <div className="text-xs font-medium text-slate-500 dark:text-slate-400">{t("plan.when", { value: card.when })}</div>

              {impact?.co2eKgPerYear !== undefined && impact.co2eKgPerYear > 0 && (
                <div className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                  {t("plan.co2e_savings")}: {Math.round(impact.co2eKgPerYear)} {t("impact.per_year")}
                </div>
              )}

              {card.steps.length > 0 && (
                <ul className="list-disc list-inside text-sm space-y-1 text-slate-600 dark:text-slate-400">
                  {card.steps.map((s, idx) => (
                    <li key={idx}>{s}</li>
                  ))}
                </ul>
              )}

              {impact && (
                <details className="text-xs text-slate-500 dark:text-slate-400 pt-1">
                  <summary className="cursor-pointer font-medium min-h-[44px] flex items-center">
                    {t("plan.how_calculated")}
                  </summary>
                  <div className="pt-2 space-y-1">
                    <p>{impact.method}</p>
                    {impact.assumptions.length > 0 && (
                      <p>{t("plan.assumptions", { value: impact.assumptions.join("; ") })}</p>
                    )}
                    <p>{t("plan.confidence", { value: impact.confidence })}</p>
                  </div>
                </details>
              )}
            </article>
          );
        })}
      </div>

      {/* Member notes & Trade-offs */}
      {plan && (plan.memberNotes.length > 0 || plan.tradeoffs.length > 0) && (
        <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {plan.memberNotes.length > 0 && (
            <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2">
              <h2 className="text-base font-bold">{t("plan.member_notes")}</h2>
              <ul className="space-y-2 text-sm">
                {plan.memberNotes.map((n, idx) => (
                  <li key={idx}>
                    <span className="font-semibold capitalize">{n.group}: </span>
                    {n.note}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {plan.tradeoffs.length > 0 && (
            <div className="p-5 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 space-y-2">
              <h2 className="text-base font-bold">{t("plan.trade_offs")}</h2>
              <ul className="list-disc list-inside space-y-1 text-sm">
                {plan.tradeoffs.map((tr, idx) => (
                  <li key={idx}>{tr}</li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {/* Myth cards */}
      <section className="space-y-3">
        <h2 className="text-lg font-bold">{t("plan.common_myths")}</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {MYTHS.map((m) => (
            <div key={m.id} className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1">
              <div className="font-semibold text-sm">{t(m.i18nKey)}</div>
              <p className="text-xs text-slate-600 dark:text-slate-300">{t(`${m.i18nKey}_fact`)}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">{t("plan.source", { value: m.source })}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
