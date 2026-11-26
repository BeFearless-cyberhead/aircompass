"use client";

import React, { useState } from "react";
import { useAirCompass, SAMPLE_FAMILY_PROFILE } from "./AirCompassProvider";
import { aqiFromPm25, levelOfPm25 } from "@/lib/engine/bands";
import { findBestWindow, findAvoidWindow } from "@/lib/engine/window";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  toolUsed?: boolean;
}

export function BriefView() {
  const { profile, context, planResult, t } = useAirCompass();
  const activeProfile = profile ?? SAMPLE_FAMILY_PROFILE;

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [copied, setCopied] = useState(false);

  const next24 = context.hours.slice(context.nowIndex, context.nowIndex + 24);
  const meanPm25 =
    next24.length > 0 ? next24.reduce((a, b) => a + b.pm25, 0) / next24.length : 0;
  const todayAqi = aqiFromPm25(meanPm25);
  const level = levelOfPm25(meanPm25);

  const byHour = Array(24).fill(meanPm25) as number[];
  for (const h of next24) {
    const hr = Number(h.t.slice(11, 13));
    if (Number.isInteger(hr) && hr >= 0 && hr < 24) byHour[hr] = h.pm25;
  }
  const bestWin = findBestWindow(byHour);
  const avoidWin = findAvoidWindow(byHour);

  const shareText =
    `${t("app.title")} — ${activeProfile.place.name}: ${t("today.aqi_label")} ${todayAqi} (${t(`levels.${level}`)}). ` +
    (bestWin
      ? `${t("today.best_window", { start: `${bestWin.start}:00`, end: `${bestWin.end}:00` })}. `
      : "") +
    (avoidWin && level >= 2
      ? `${t("today.avoid_window", { start: `${avoidWin.start}:00`, end: `${avoidWin.end}:00` })}. `
      : "") +
    (planResult?.plan.headline ?? "");

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const q = input.trim();
    if (!q || sending) return;
    setInput("");
    const nextHistory = [...messages, { role: "user" as const, content: q }];
    setMessages(nextHistory);
    setSending(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: q,
          history: nextHistory.slice(-6).map((m) => ({ role: m.role, content: m.content })),
          profile: activeProfile,
          context,
        }),
      });
      if (res.ok) {
        const data = (await res.json()) as { response: string; toolUsed?: boolean };
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: data.response, toolUsed: data.toolUsed },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: t("chat.error_generic") },
        ]);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: t("chat.error_network") },
      ]);
    } finally {
      setSending(false);
    }
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(shareText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Ignore
    }
  }

  return (
    <div className="space-y-8">
      {/* Grounded Chat */}
      <section aria-labelledby="chat-heading" className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4 print:hidden">
        <div>
          <h1 id="chat-heading" className="text-2xl font-bold tracking-tight">
            {t("chat.title")}
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{t("chat.scope_note")}</p>
        </div>

        <div className="space-y-3 max-h-80 overflow-y-auto">
          {messages.map((m, idx) => (
            <div
              key={idx}
              className={`p-3 rounded-xl text-sm ${
                m.role === "user"
                  ? "bg-teal-50 dark:bg-teal-950/50 ml-8"
                  : "bg-slate-100 dark:bg-slate-800 mr-8"
              }`}
            >
              <div className="text-xs font-semibold mb-1 capitalize">
                {m.role === "user" ? t("chat.you") : t("chat.assistant")}
                {m.toolUsed && (
                  <span className="ml-2 px-1.5 py-0.5 rounded bg-teal-200 dark:bg-teal-900 text-[10px]">
                    simulate_scenario
                  </span>
                )}
              </div>
              <p className="whitespace-pre-wrap">{m.content}</p>
            </div>
          ))}
        </div>

        <form onSubmit={(e) => void handleSend(e)} className="flex gap-2">
          <label htmlFor="chat-input" className="sr-only">
            {t("chat.placeholder")}
          </label>
          <input
            id="chat-input"
            type="text"
            maxLength={500}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={t("chat.placeholder")}
            className="flex-1 min-h-[44px] px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent text-sm"
          />
          <button
            type="submit"
            disabled={sending || !input.trim()}
            className="min-h-[44px] px-5 py-2 rounded-lg bg-teal-700 text-white text-sm font-semibold hover:bg-teal-800 disabled:opacity-50"
          >
            {sending ? t("chat.tool_call") : t("chat.send")}
          </button>
        </form>
      </section>

      {/* Share */}
      <section className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3 print:hidden">
        <h2 className="text-lg font-bold">{t("share.title")}</h2>
        <p className="text-sm text-slate-600 dark:text-slate-300">{shareText}</p>
        <div className="flex flex-wrap gap-3">
          <a
            href={`https://wa.me/?text=${encodeURIComponent(shareText)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="min-h-[44px] px-4 py-2 rounded-xl bg-emerald-700 text-white text-sm font-semibold flex items-center"
          >
            {t("share.whatsapp")}
          </a>
          <button
            type="button"
            onClick={() => void handleCopy()}
            className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-sm font-semibold"
          >
            {copied ? t("share.copied") : t("share.copy")}
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="min-h-[44px] px-4 py-2 rounded-xl bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900 text-sm font-semibold"
          >
            {t("share.print")}
          </button>
        </div>
      </section>

      {/* Printable Community Brief */}
      <section aria-labelledby="brief-heading" className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
        <h2 id="brief-heading" className="text-xl font-bold">
          {t("share.community_brief")} — {activeProfile.place.name}
        </h2>
        <p className="text-sm">
          <strong>{t("share.brief_today")}</strong> {t("today.aqi_label")} {todayAqi} (
          {t(`levels.${level}`)}), {t("today.pm25_24h_mean", { value: Math.round(meanPm25) })}.
        </p>
        <p className="text-sm">
          <strong>{t("share.brief_timing")}</strong>{" "}
          {bestWin
            ? `${t("today.best_window", { start: `${bestWin.start}:00`, end: `${bestWin.end}:00` })}.`
            : ""}{" "}
          {avoidWin && level >= 2
            ? `${t("today.avoid_window", { start: `${avoidWin.start}:00`, end: `${avoidWin.end}:00` })}.`
            : ""}
        </p>
        <div className="space-y-2 text-sm">
          <h3 className="font-semibold">{t("share.brief_community")}</h3>
          <ul className="list-disc list-inside space-y-1">
            <li>{t("share.brief_action_1")}</li>
            <li>{t("share.brief_action_2")}</li>
            <li>{t("share.brief_action_3")}</li>
            <li>{t("share.brief_action_4")}</li>
          </ul>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400">{t("share.brief_footer")}</p>
      </section>
    </div>
  );
}
