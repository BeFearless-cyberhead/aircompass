"use client";

import { useAirCompass } from "./AirCompassProvider";

export function AboutView() {
  const { t } = useAirCompass();

  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-2xl font-bold">{t("about.title")}</h1>
      <p className="text-sm text-slate-600 dark:text-slate-300">{t("about.intro")}</p>
      <ul className="list-disc list-inside text-sm space-y-1 text-slate-600 dark:text-slate-300">
        <li>{t("about.bullet1")}</li>
        <li>{t("about.bullet2")}</li>
        <li>{t("about.bullet3")}</li>
        <li>{t("about.bullet4")}</li>
      </ul>
      <p className="text-sm font-medium">{t("about.privacy")}</p>
    </div>
  );
}
