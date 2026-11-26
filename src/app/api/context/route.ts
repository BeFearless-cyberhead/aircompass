import { NextResponse, type NextRequest } from "next/server";
import { fetchAirContext } from "@/lib/providers/openMeteo";
import { getDemoContext } from "@/lib/providers/demo";
import { ContextRequestSchema } from "@/lib/schemas";
import { checkRateLimit } from "@/lib/security/rateLimit";

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

  const parsed = ContextRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.issues },
      { status: 400 },
    );
  }

  if (parsed.data.demo) {
    return NextResponse.json(getDemoContext(), { headers: { "Cache-Control": "no-store" } });
  }

  try {
    const context = await fetchAirContext(parsed.data.lat, parsed.data.lon);
    return NextResponse.json(context, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    // Upstream outage must not break the demo: fall back to the recorded day and say so.
    console.error("Context API upstream error:", err instanceof Error ? err.message : "unknown");
    return NextResponse.json(getDemoContext(), { headers: { "Cache-Control": "no-store" } });
  }
}
