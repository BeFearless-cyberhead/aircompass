import { NextResponse, type NextRequest } from "next/server";
import { geocode } from "@/lib/providers/geocode";
import { checkRateLimit } from "@/lib/security/rateLimit";

export async function GET(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for") ?? "unknown";
  const rateCheck = checkRateLimit(ip);
  if (!rateCheck.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (!q || q.length > 80) {
    return NextResponse.json({ results: [] });
  }

  const results = await geocode(q);
  return NextResponse.json({ results });
}
