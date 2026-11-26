import { NextResponse, type NextRequest } from "next/server";
import { generatePlan } from "@/lib/llm/gemini";
import { checkRateLimit, recordLlmCall, isLlmAvailable } from "@/lib/security/rateLimit";
import { PlanRequestSchema } from "@/lib/schemas";
import { isAvailable } from "@/lib/llm/client";
import { sanitize } from "@/lib/security/sanitize";

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

  const parsed = PlanRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.issues },
      { status: 400 },
    );
  }

  const profile = {
    ...parsed.data.profile,
    ...(parsed.data.profile.notes !== undefined ? { notes: sanitize(parsed.data.profile.notes) } : {}),
  };

  // The daily model-call cap is a cost ceiling, never a correctness gate:
  // when it is reached the deterministic engine plan is returned with a badge.
  const useLlm = isLlmAvailable() && isAvailable();
  if (useLlm) recordLlmCall();

  try {
    const result = await generatePlan(profile, parsed.data.context, { useLlm });
    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    console.error("Plan API error:", err instanceof Error ? err.message : "unknown");
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
