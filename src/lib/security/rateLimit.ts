/**
 * Security: per-IP rate limit + daily LLM-call cap (§7).
 *
 * In-memory only: on serverless this is per instance and best-effort, stated plainly in SECURITY.md.
 * The bucket map is bounded so a spoofed-IP flood cannot grow memory without limit.
 */

interface BucketEntry {
  tokens: number;
  lastRefill: number;
}

const MAX_BUCKETS = 5000;
const buckets = new Map<string, BucketEntry>();
let dailyCalls = 0;
let dailyResetAt = Date.now() + 24 * 60 * 60 * 1000;

const MAX_TOKENS = 10;
const REFILL_RATE = 1; // tokens per second
const parsedCap = Number.parseInt(process.env.DAILY_LLM_CAP ?? "500", 10);
const DAILY_CAP = Number.isFinite(parsedCap) && parsedCap > 0 ? parsedCap : 500;

/** Hash IP for privacy (FNV-1a). Raw IPs never leave this module or reach logs. */
function hashIp(ip: string): string {
  let hash = 2166136261;
  for (let i = 0; i < ip.length; i++) {
    hash ^= ip.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function resetDailyIfNeeded(now: number): void {
  if (now > dailyResetAt) {
    dailyCalls = 0;
    dailyResetAt = now + 24 * 60 * 60 * 1000;
  }
}

function evictIfNeeded(now: number): void {
  if (buckets.size < MAX_BUCKETS) return;
  // Drop fully refilled buckets first; if none, drop the oldest insertion.
  for (const [key, entry] of buckets) {
    if (now - entry.lastRefill > MAX_TOKENS * 1000) buckets.delete(key);
  }
  while (buckets.size >= MAX_BUCKETS) {
    const oldest = buckets.keys().next().value;
    if (oldest === undefined) break;
    buckets.delete(oldest);
  }
}

export function checkRateLimit(ip: string): {
  allowed: boolean;
  remaining: number;
  llmAvailable: boolean;
} {
  const now = Date.now();
  resetDailyIfNeeded(now);
  evictIfNeeded(now);
  const key = hashIp(ip);

  let entry = buckets.get(key);
  if (!entry) {
    entry = { tokens: MAX_TOKENS, lastRefill: now };
    buckets.set(key, entry);
  }

  const elapsed = (now - entry.lastRefill) / 1000;
  entry.tokens = Math.min(MAX_TOKENS, entry.tokens + elapsed * REFILL_RATE);
  entry.lastRefill = now;

  if (entry.tokens < 1) {
    return { allowed: false, remaining: 0, llmAvailable: dailyCalls < DAILY_CAP };
  }

  entry.tokens -= 1;
  return {
    allowed: true,
    remaining: Math.floor(entry.tokens),
    llmAvailable: dailyCalls < DAILY_CAP,
  };
}

/** Increment the daily LLM call counter. */
export function recordLlmCall(): void {
  resetDailyIfNeeded(Date.now());
  dailyCalls++;
}

/** Check if LLM calls are available under the daily cap. */
export function isLlmAvailable(): boolean {
  resetDailyIfNeeded(Date.now());
  return dailyCalls < DAILY_CAP;
}
