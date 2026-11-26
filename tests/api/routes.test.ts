import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { getDemoContext } from "@/lib/providers/demo";
import { selectActions } from "@/lib/engine/select";
import { buildBaselineScenario } from "@/lib/engine/baseline";
import type { Plan, Profile } from "@/lib/types";

const mockGenerate = vi.fn();
const mockIsAvailable = vi.fn(() => true);
const mockGenerateChatWithTools = vi.fn();
const mockFetchAirContext = vi.fn();

vi.mock("@/lib/llm/client", () => ({
  generate: (...args: unknown[]) => mockGenerate(...args),
  isAvailable: () => mockIsAvailable(),
  generateChatWithTools: (...args: unknown[]) => mockGenerateChatWithTools(...args),
}));

vi.mock("@/lib/providers/openMeteo", () => ({
  fetchAirContext: (...args: unknown[]) => mockFetchAirContext(...args),
}));

import { POST as planPost } from "@/app/api/plan/route";
import { POST as contextPost } from "@/app/api/context/route";
import { POST as chatPost } from "@/app/api/chat/route";

const VALID_PROFILE: Profile = {
  lang: "en",
  place: { name: "Greater Noida", lat: 28.47, lon: 77.5, country: "IN" },
  household: { adults: 2, children: 1, seniors: 0, conditions: ["respiratory"] },
  home: { type: "apartment", windows: "normal", ac: true, purifier: "none", cooking: "lpg", roomAreaM2: 15 },
  commute: { mode: "car", km: 12, daysPerWeek: 5 },
  habits: { morningOutdoorExercise: true, schoolRun: true },
  budget: "low",
};

let ipCounter = 0;
const nextIp = () => `10.1.0.${++ipCounter}`;

function makeReq(url: string, body: unknown, ip = nextIp(), contentType = "application/json"): NextRequest {
  return new NextRequest(url, {
    method: "POST",
    headers: { "Content-Type": contentType, "x-forwarded-for": ip },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

/** Build a model-shaped plan from the actual candidate list: setup, not an expectation. */
function validPlan(outcomeLang: "en" | "hi" = "en"): Plan {
  const ctx = getDemoContext();
  const ranked = selectActions(VALID_PROFILE, ctx, buildBaselineScenario(VALID_PROFILE), ctx.hours, ctx.nowIndex);
  const bySection = ["routine", "indoor", "swap"].map((section) =>
    ranked.filter((r) => r.action.section === section).slice(0, 2),
  );
  const ids = bySection.flat().map((r) => r.action.id);
  const hi = outcomeLang === "hi";
  return {
    headline: hi ? "आज आपके परिवार के लिए स्वच्छ हवा योजना" : "A cleaner-air routine for your family today",
    summary: hi
      ? "हवा {{level.name}} है। सबसे अच्छा समय {{best.start}} से {{best.end}} है।"
      : "Air is {{level.name}}. The cleanest window is {{best.start}} to {{best.end}}.",
    cards: ids.map((id) => ({
      actionId: id,
      title: hi ? "स्वच्छ हवा के लिए एक कदम" : "A practical step for cleaner air",
      why: hi
        ? "यह आपके सांस की हवा को {{impact." + id + ".pct}} बेहतर कर सकता है"
        : "This can improve the air you breathe by {{impact." + id + ".pct}}",
      when: hi ? "आज, {{best.start}} के आसपास" : "Today, around {{best.start}}",
      steps: [],
    })),
    memberNotes: [],
    tradeoffs: [],
  };
}

describe("API contract tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsAvailable.mockReturnValue(true);
    mockFetchAirContext.mockRejectedValue(new Error("upstream down"));
  });

  it("/api/context: demo, validation, and honest fallback on upstream failure", async () => {
    const demoRes = await contextPost(makeReq("http://localhost/api/context", { lat: 28.47, lon: 77.5, demo: true }));
    expect(demoRes.status).toBe(200);
    const demo = await demoRes.json();
    expect(demo.source).toBe("demo");
    expect(demo.hours.length).toBeGreaterThan(0);

    // Invalid coordinates and malformed body are rejected before any fetch.
    const bad = await contextPost(makeReq("http://localhost/api/context", { lat: 999, lon: 0 }));
    expect(bad.status).toBe(400);
    const wrongType = await contextPost(makeReq("http://localhost/api/context", { lat: 1, lon: 1 }, nextIp(), "text/plain"));
    expect(wrongType.status).toBe(415);
    const badJson = await contextPost(makeReq("http://localhost/api/context", "{not json"));
    expect(badJson.status).toBe(400);

    // Live request: upstream failure returns the labelled recorded day, never a 500.
    const liveRes = await contextPost(makeReq("http://localhost/api/context", { lat: 28.47, lon: 77.5 }));
    expect(liveRes.status).toBe(200);
    expect((await liveRes.json()).source).toBe("demo");
  });

  it("/api/plan: throws, garbage, unknown ids, and raw digits all produce a valid engine plan", async () => {
    const ctx = getDemoContext();
    const body = { profile: VALID_PROFILE, context: ctx };

    mockGenerate.mockRejectedValue(new Error("timeout"));
    const thrown = await planPost(makeReq("http://localhost/api/plan", body));
    expect(thrown.status).toBe(200);
    expect((await thrown.json()).outcome).toBe("fallback");

    const malformed = [
      "not json at all",
      JSON.stringify({ ...validPlan(), cards: [] }),
      JSON.stringify({
        ...validPlan(),
        cards: validPlan().cards.map((c) => ({ ...c, actionId: "share_community_brief" })),
      }),
      JSON.stringify({ ...validPlan(), headline: "AQI is 312 today" }),
      JSON.stringify({ ...validPlan(), summary: "Air is {{level.name}}. Contact https://evil.example" }),
    ];

    for (const text of malformed) {
      mockGenerate.mockReset();
      mockGenerate.mockResolvedValue({ text });
      const res = await planPost(makeReq("http://localhost/api/plan", body));
      expect(res.status, text.slice(0, 40)).toBe(200);
      const data = await res.json();
      expect(data.outcome, text.slice(0, 40)).toBe("fallback");
      expect(data.plan.cards.length).toBeGreaterThanOrEqual(5);
    }
  });

  it("/api/plan: accepts a valid plan and uses the one repair call when the first response is invalid", async () => {
    const ctx = getDemoContext();
    const body = { profile: VALID_PROFILE, context: ctx };
    const valid = JSON.stringify(validPlan());

    mockGenerate.mockResolvedValueOnce({ text: valid });
    const ai = await planPost(makeReq("http://localhost/api/plan", body));
    expect(ai.status).toBe(200);
    expect((await ai.json()).outcome).toBe("ai");

    mockGenerate.mockReset();
    mockGenerate.mockResolvedValueOnce({ text: "{broken" }).mockResolvedValueOnce({ text: valid });
    const repaired = await planPost(makeReq("http://localhost/api/plan", body));
    expect(repaired.status).toBe(200);
    expect((await repaired.json()).outcome).toBe("repaired");
    expect(mockGenerate).toHaveBeenCalledTimes(2);
  });

  it("/api/plan: rejects malformed context and oversized bodies", async () => {
    const ctx = getDemoContext();
    const badContext = await planPost(
      makeReq("http://localhost/api/plan", { profile: VALID_PROFILE, context: { ...ctx, nowIndex: 500 } }),
    );
    expect(badContext.status).toBe(400);

    const huge = await planPost(makeReq("http://localhost/api/plan", "x".repeat(9000)));
    expect(huge.status).toBe(413);
  });

  it("/api/chat: replaces unfaithful numbers, leaks, and medical claims with the engine summary", async () => {
    const ctx = getDemoContext();
    const now = ctx.hours[ctx.nowIndex];
    const body = { message: "What is the AQI?", profile: VALID_PROFILE, context: ctx };

    const unsafe = [
      { text: "The AQI is 999 which is guaranteed to be cured.", toolUsed: false, toolNumbers: [] },
      { text: "Here is the plan: https://evil.example", toolUsed: false, toolNumbers: [] },
      { text: "Take 50 mg of this and you will be cured.", toolUsed: false, toolNumbers: [] },
    ];
    for (const model of unsafe) {
      mockGenerateChatWithTools.mockReset();
      mockGenerateChatWithTools.mockResolvedValue(model);
      const res = await chatPost(makeReq("http://localhost/api/chat", body));
      expect(res.status, model.text).toBe(200);
      const data = await res.json();
      expect(data.outcome, model.text).toBe("engine");
      expect(data.note).toContain("unfaithful number");
      expect(data.response).not.toContain("999");
      expect(data.response).toContain(String(Math.round(now.pm25)));
    }
  });

  it("/api/chat: keeps a faithful answer and degrades to the engine when no model is available", async () => {
    const ctx = getDemoContext();
    const now = ctx.hours[ctx.nowIndex];
    const body = { message: "What is the AQI?", profile: VALID_PROFILE, context: ctx };

    mockGenerateChatWithTools.mockResolvedValue({
      text: `PM2.5 is ${now.pm25} µg/m³ and US AQI is ${now.usAqi}.`,
      toolUsed: false,
      toolNumbers: [],
    });
    const ai = await chatPost(makeReq("http://localhost/api/chat", body));
    expect(ai.status).toBe(200);
    expect((await ai.json()).outcome).toBe("ai");

    mockIsAvailable.mockReturnValue(false);
    const engine = await chatPost(makeReq("http://localhost/api/chat", body));
    expect(engine.status).toBe(200);
    const data = await engine.json();
    expect(data.outcome).toBe("engine");
    expect(data.response).toContain("AI chat is currently unavailable");
  });
});
