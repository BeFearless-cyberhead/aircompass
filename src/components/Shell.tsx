"use client";

import React, { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAirCompass } from "./AirCompassProvider";

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const mainRef = useRef<HTMLElement>(null);
  const { lang, setLang, demoMode, toggleDemoMode, context, profile, deleteMyData, t } =
    useAirCompass();

  // Move focus to the page region after client-side navigation (WCAG 2.2, focus order).
  useEffect(() => {
    mainRef.current?.focus();
  }, [pathname]);

  const navItems = [
    { href: "/", label: t("nav.today") },
    { href: "/plan", label: t("nav.plan") },
    { href: "/impact", label: t("nav.impact") },
    { href: "/brief", label: t("nav.ask") },
    { href: "/setup", label: t("nav.setup") },
  ];

  const dataBadge =
    context.source === "demo"
      ? context.recordedDate
        ? t("app.recorded_badge", { date: context.recordedDate })
        : t("app.illustrative_badge")
      : context.dataNote === "cams_europe_11km"
        ? t("app.data_note_europe")
        : t("app.data_note_global");

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:bg-teal-700 focus:text-white focus:px-4 focus:py-2 focus:rounded"
      >
        {t("app.skip_to_content")}
      </a>

      <header className="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 print:hidden">
        <div className="max-w-5xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link href="/" className="text-xl font-bold tracking-tight text-teal-700 dark:text-teal-400">
              {t("app.title")}
            </Link>
            <span
              className="text-xs px-2 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700"
              title={t("today.data_source")}
            >
              {dataBadge}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void toggleDemoMode()}
              data-testid="demo-toggle"
              className="min-h-[44px] px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              {demoMode ? t("app.toggle_live") : t("app.toggle_demo")}
            </button>

            <button
              type="button"
              onClick={() => setLang(lang === "en" ? "hi" : "en")}
              data-testid="lang-toggle"
              aria-label={`${t("app.language")}: ${lang === "en" ? "हिन्दी" : "English"}`}
              className="min-h-[44px] min-w-[44px] px-3 py-1.5 text-sm font-semibold rounded-lg bg-teal-700 text-white hover:bg-teal-800"
            >
              {lang === "en" ? "हिन्दी" : "English"}
            </button>
          </div>
        </div>

        <nav aria-label={t("app.primary_nav")} className="max-w-5xl mx-auto px-4 pb-2 flex gap-1 overflow-x-auto">
          {navItems.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`min-h-[44px] px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap flex items-center ${
                  active
                    ? "bg-teal-50 text-teal-800 dark:bg-teal-950 dark:text-teal-200 border border-teal-200 dark:border-teal-800"
                    : "text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </header>

      <main
        id="main-content"
        ref={mainRef}
        tabIndex={-1}
        className="flex-1 max-w-5xl w-full mx-auto px-4 py-6 focus:outline-none"
      >
        {children}
      </main>

      <footer className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 py-6 text-xs text-slate-600 dark:text-slate-400 print:hidden">
        <div className="max-w-5xl mx-auto px-4 space-y-3">
          <div role="note" className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200 font-medium">
            {t("app.emergency")}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1">
              <p>{t("app.not_medical_advice")}</p>
              <p>{t("app.attribution")}</p>
              <p>{t("app.built_with")}</p>
            </div>
            <div className="flex items-center gap-3">
              <Link href="/about" className="underline hover:text-slate-900 dark:hover:text-slate-200 min-h-[44px] flex items-center">
                {t("app.about")}
              </Link>
              {profile && (
                <button
                  type="button"
                  onClick={deleteMyData}
                  className="min-h-[44px] px-3 py-1.5 rounded border border-rose-300 text-rose-700 dark:border-rose-800 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950"
                >
                  {t("app.delete_data")}
                </button>
              )}
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
