/**
 * Deterministic mitigation text for actions whose engine impact increases breathing exposure.
 * The LLM may word a trade-off, but it cannot omit the mitigation: code appends one per negative card.
 */
import type { Lang, Plan } from "../types";
import type { RankedAction } from "./select";
import { getAction } from "./catalog";
import en from "../../i18n/en.json";
import hi from "../../i18n/hi.json";

const DICTS: Record<Lang, typeof en> = { en, hi };

const MITIGATION_KEY: Record<string, string> = {
  commute_to_public_transport: "transport",
  walk_or_cycle_short_trips: "walk",
  air_house_in_best_window: "windows",
};

function text(lang: Lang, key: string): string {
  const node = DICTS[lang].plan.mitigations as Record<string, string>;
  return node[key] ?? DICTS.en.plan.mitigations.default;
}

function actionTitle(lang: Lang, actionId: string): string {
  const node = DICTS[lang].action as Record<string, string>;
  const key = getAction(actionId)?.i18nKey ?? actionId;
  return node[key.replace(/^action\./, "")] ?? actionId;
}

/** Append one mitigation line per negative-impact card that is actually in the plan. */
export function withTradeoffMitigations(plan: Plan, ranked: RankedAction[], lang: Lang): Plan {
  const cardIds = new Set(plan.cards.map((c) => c.actionId));
  const lines = [...plan.tradeoffs];

  for (const r of ranked) {
    if (r.impact.exposureDeltaUgM3 >= 0 || !cardIds.has(r.action.id)) continue;
    const title = actionTitle(lang, r.action.id);
    if (lines.some((line) => line.includes(title))) continue;
    lines.push(`${title}: ${text(lang, MITIGATION_KEY[r.action.id] ?? "default")}`);
  }

  return { ...plan, tradeoffs: lines };
}
