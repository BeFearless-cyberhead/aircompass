import { NextResponse, type NextRequest } from "next/server";
import { checkRateLimit, recordLlmCall, isLlmAvailable } from "@/lib/security/rateLimit";
import { ChatRequestSchema } from "@/lib/schemas";
import { generateChatWithTools, isAvailable } from "@/lib/llm/client";
import { CHAT_SYSTEM_PROMPT } from "@/lib/llm/prompt";
import { simulateScenario } from "@/lib/llm/tools";
import { findChatViolations, unfaithfulNumbers } from "@/lib/llm/guard";
import { sanitize } from "@/lib/security/sanitize";
import type { Profile } from "@/lib/types";

export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const rate = checkRateLimit(ip);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": "2" } },
    );
  }

  if (!request.headers.get("content-type")?.includes("application/json")) {
    return NextResponse.json({ error: "Content-Type must be application/json" }, { status: 415 });
  }

  let body: unknown;
  try {
    const text = await request.text();
    if (new TextEncoder().encode(text).length > 8192) {
      return NextResponse.json({ error: "Request too large" }, { status: 413 });
    }
    body = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = ChatRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.issues },
      { status: 400 },
    );
  }

  const { message, history, context } = parsed.data;
  const profile = parsed.data.profile as Profile;
  const cleanMessage = sanitize(message).slice(0, 500);

  if (!isAvailable() || !isLlmAvailable()) {
    const sim = simulateScenario({ purifier: "hepa" }, profile, context.hours, context.nowIndex);
    return NextResponse.json(
      {
        response:
          profile.lang === "hi"
            ? `AI चैट अभी उपलब्ध नहीं है। वर्तमान PM2.5: ${Math.round(context.hours[context.nowIndex]?.pm25 ?? 0)} µg/m³। HEPA प्यूरिफायर से आपका एक्सपोज़र ${sim.before} से ${sim.after} µg/m³ हो सकता है।`
            : `AI chat is currently unavailable. Current PM2.5 is ${Math.round(context.hours[context.nowIndex]?.pm25 ?? 0)} µg/m³. With a HEPA purifier, exposure drops from ${sim.before} to ${sim.after} µg/m³.`,
        toolUsed: false,
        outcome: "engine",
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  recordLlmCall();

  const nowHour = context.hours[context.nowIndex];
  const historyText = (history ?? [])
    .slice(-6)
    .map((h) => `${h.role}: ${sanitize(h.content).slice(0, 500)}`)
    .join("\n");

  const facts =
    `Current US AQI: ${nowHour?.usAqi ?? "unknown"}. ` +
    `PM2.5: ${nowHour?.pm25 ?? "unknown"} µg/m³. ` +
    `PM10: ${nowHour?.pm10 ?? "unknown"} µg/m³. ` +
    `Location: ${context.place.name} (${context.place.country}). ` +
    `Data: ${context.dataNote}. ` +
    `Language: ${profile.lang}.`;

  const userPrompt = `${facts}\n${historyText ? `\nRecent conversation:\n${historyText}\n` : ""}\n<user_question>${cleanMessage}</user_question>`;

  const result = await generateChatWithTools(
    CHAT_SYSTEM_PROMPT,
    userPrompt,
    (args) => simulateScenario(args, profile, context.hours, context.nowIndex),
    400,
  );

  if (!result) {
    return NextResponse.json({
      response:
        profile.lang === "hi"
          ? "अभी उत्तर नहीं बन सका। कृपया फिर कोशिश करें।"
          : "I could not process your question right now. Please try again.",
      toolUsed: false,
      outcome: "error",
    });
  }

  const allowedNumbers = [
    nowHour?.pm25 ?? 0,
    nowHour?.pm10 ?? 0,
    nowHour?.usAqi ?? 0,
    ...result.toolNumbers,
  ];
  const violations = findChatViolations(result.text);
  const unfaithful = unfaithfulNumbers(result.text, allowedNumbers);

  if (violations.length > 0 || unfaithful.length > 0) {
    return NextResponse.json(
      {
        response:
          profile.lang === "hi"
            ? `वर्तमान वायु गुणवत्ता: PM2.5 ${nowHour?.pm25 ?? 0} µg/m³, AQI ${nowHour?.usAqi ?? 0}। विस्तृत मार्गदर्शन के लिए योजना देखें।`
            : `Current air quality: PM2.5 ${nowHour?.pm25 ?? 0} µg/m³, AQI ${nowHour?.usAqi ?? 0}. Please check the plan view for detailed guidance.`,
        toolUsed: result.toolUsed,
        note: "Response replaced by the engine (unfaithful number, unsafe text, or prompt leak)",
        outcome: "engine",
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  return NextResponse.json(
    {
      response: result.text,
      toolUsed: result.toolUsed,
      tokensUsed: result.tokensOut,
      outcome: "ai",
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
