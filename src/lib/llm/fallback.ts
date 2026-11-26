/**
 * Deterministic fallback plan (§6.6).
 * Pure function: top-7 ranked actions → i18n template text with tokens → valid Plan.
 * Must pass the same guard and schema.
 */
import type { Plan, Level, Lang } from "../types";
import type { RankedAction } from "../engine/select";
import enStrings from "../../i18n/en.json";
import hiStrings from "../../i18n/hi.json";

const strings: Record<Lang, typeof enStrings> = {
  en: enStrings,
  hi: hiStrings,
};

function t(lang: Lang, actionId: string): string {
  const dict = strings[lang].action as Record<string, string>;
  const fallback = enStrings.action as Record<string, string>;
  return dict[actionId] ?? fallback[actionId] ?? actionId;
}

const LEVEL_HEADLINES_EN: Record<Level, string> = {
  0: "Air is {{level.name}} today — enjoy the outdoors",
  1: "Air is {{level.name}} — a few precautions for sensitive members",
  2: "Air is {{level.name}} — take care with outdoor activities",
  3: "Air is {{level.name}} — reduce outdoor time, protect your family",
  4: "Air is {{level.name}} — stay indoors as much as possible",
  5: "Air is {{level.name}} — take protective measures now",
};

const LEVEL_HEADLINES_HI: Record<Level, string> = {
  0: "हवा {{level.name}} है — बाहर का आनंद लें",
  1: "हवा {{level.name}} है — संवेदनशील सदस्यों के लिए कुछ सावधानियां",
  2: "हवा {{level.name}} है — बाहरी गतिविधियों में सावधानी बरतें",
  3: "हवा {{level.name}} है — बाहर का समय कम करें, परिवार को सुरक्षित रखें",
  4: "हवा {{level.name}} है — जितना हो सके घर के अंदर रहें",
  5: "हवा {{level.name}} है — अभी सुरक्षात्मक उपाय करें",
};

/**
 * Build a deterministic fallback plan from ranked actions.
 * Uses i18n templates with {{token}} placeholders (resolved later by the guard's render function).
 */
export function buildFallbackPlan(
  ranked: RankedAction[],
  level: Level,
  lang: Lang,
): Plan {
  const chosen = balancedCards(ranked);
  const headlines = lang === "hi" ? LEVEL_HEADLINES_HI : LEVEL_HEADLINES_EN;

  const cards = chosen.map((r) => ({
    actionId: r.action.id,
    title: t(lang, r.action.i18nKey.replace("action.", "")),
    why: r.impact.kind === "quantified"
      ? lang === "hi"
        ? `यह आपके सांस लेने की हवा को {{impact.${r.action.id}.pct}} बेहतर कर सकता है`
        : `This can improve the air you breathe by {{impact.${r.action.id}.pct}}`
      : lang === "hi"
        ? "विशेषज्ञों द्वारा अनुशंसित"
        : "Recommended by experts",
    when: lang === "hi" ? "आज" : "Today",
    steps: [],
  }));

  return {
    headline: headlines[level],
    summary:
      level <= 1
        ? lang === "hi"
          ? `AQI {{aqi.now}} — सबसे अच्छा समय {{best.start}}–{{best.end}}`
          : `AQI {{aqi.now}} — best window {{best.start}}–{{best.end}}`
        : lang === "hi"
          ? `AQI {{aqi.now}} — सबसे अच्छा समय {{best.start}}–{{best.end}}, बचें {{avoid.start}}–{{avoid.end}}`
          : `AQI {{aqi.now}} — best window {{best.start}}–{{best.end}}, avoid {{avoid.start}}–{{avoid.end}}`,
    cards,
    memberNotes: [],
    tradeoffs: [],
  };
}

/**
 * Top-scored cards, then guarantee ≥ 1 per section where candidates exist.
 * Schema allows 5–8 cards; `selectActions` already keeps ≥ 2 candidates per section.
 */
function balancedCards(ranked: RankedAction[]): RankedAction[] {
  const chosen = ranked.slice(0, 7);
  const count = (section: string) => chosen.filter((r) => r.action.section === section).length;

  for (const section of ["routine", "indoor", "swap"] as const) {
    if (count(section) > 0) continue;
    const candidate = ranked.find((r) => r.action.section === section);
    if (!candidate) continue;

    if (chosen.length < 8) {
      chosen.push(candidate);
      continue;
    }

    // Replace the lowest-ranked card from an over-represented section.
    const replaceAt = chosen.findLastIndex((r) => count(r.action.section) > 1);
    if (replaceAt >= 0) chosen.splice(replaceAt, 1);
    chosen.push(candidate);
  }

  return chosen.slice(0, 8);
}

