import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

/**
 * The limiter is module-level state. Re-import after resetting modules and the clock
 * so a test can prove both the burst bucket and the daily cap without waiting a day.
 */
describe("rate limiter and daily model cap", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-25T00:00:00Z"));
    vi.resetModules();
  });

  afterEach(() => {
    vi.useRealTimers();
    delete process.env.DAILY_LLM_CAP;
  });

  it("allows a 10-request burst per IP, refills over time, and keeps IPs in separate buckets", async () => {
    const { checkRateLimit } = await import("@/lib/security/rateLimit");
    const burst = Array.from({ length: 11 }, () => checkRateLimit("203.0.113.5").allowed);
    expect(burst.filter(Boolean)).toHaveLength(10);
    expect(burst[10]).toBe(false);

    vi.advanceTimersByTime(2000);
    expect(checkRateLimit("203.0.113.5").allowed).toBe(true);
    expect(checkRateLimit("203.0.113.6").allowed).toBe(true);
  });

  it("reports the daily cap only after the configured number of calls, then resets after 24h", async () => {
    process.env.DAILY_LLM_CAP = "2";
    const { isLlmAvailable, recordLlmCall } = await import("@/lib/security/rateLimit");

    expect(isLlmAvailable()).toBe(true);
    recordLlmCall();
    expect(isLlmAvailable()).toBe(true);
    recordLlmCall();
    expect(isLlmAvailable()).toBe(false);

    vi.advanceTimersByTime(24 * 60 * 60 * 1000 + 1);
    expect(isLlmAvailable()).toBe(true);
  });
});
