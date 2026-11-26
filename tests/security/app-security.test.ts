import { describe, it, expect } from "vitest";
import { sanitize, validateBodySize } from "@/lib/security/sanitize";
import { checkRateLimit } from "@/lib/security/rateLimit";
import { ProfileSchema } from "@/lib/schemas";

describe("security controls", () => {
  it("strips control characters and enforces body size limits", () => {
    expect(sanitize("hello\x00\x1f world\x7f")).toBe("hello world");
    expect(validateBodySize("a".repeat(8192))).toBe(true);
    expect(validateBodySize("a".repeat(8193))).toBe(false);
  });

  it("enforces strict Zod schema on Profile (rejects extra fields)", () => {
    const res = ProfileSchema.safeParse({
      lang: "en",
      place: { name: "Test", lat: 28, lon: 77, country: "IN" },
      household: { adults: 1, children: 0, seniors: 0, conditions: [] },
      home: { type: "apartment", windows: "normal", ac: false, purifier: "none", cooking: "lpg", roomAreaM2: 15 },
      commute: { mode: "car", km: 10, daysPerWeek: 5 },
      habits: { morningOutdoorExercise: false, schoolRun: false },
      budget: "low",
      extraInjectedField: "malicious",
    });
    expect(res.success).toBe(false);
  });

  it("rate limits excessive requests per IP", () => {
    const ip = "192.0.2.99";
    let blocked = false;
    for (let i = 0; i < 15; i++) {
      if (!checkRateLimit(ip).allowed) blocked = true;
    }
    expect(blocked).toBe(true);
  });
});
