import { describe, it, expect, afterEach, vi } from "vitest";
import { fetchAirContext } from "@/lib/providers/openMeteo";
import { geocode } from "@/lib/providers/geocode";

const AIR = {
  utc_offset_seconds: 0,
  hourly: {
    time: ["2026-11-25T10:00", "2026-11-25T11:00", "2026-11-25T12:00", "2026-11-25T13:00"],
    pm2_5: [80, null, 120, 130],
    pm10: [100, 110, 150, 160],
    us_aqi: [160, null, 200, 210],
  },
};

const WEATHER = {
  hourly: {
    time: ["2026-11-25T10:00", "2026-11-25T11:00"],
    temperature_2m: [24, 25],
    relative_humidity_2m: [50, 51],
    wind_speed_10m: [4, 5],
  },
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("Open-Meteo provider", () => {
  it("drops null hours, computes a missing provider AQI, and aligns nowIndex with the local clock", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-25T12:30:00Z"));
    vi.stubGlobal("fetch", vi.fn(async (url: string) => jsonResponse(url.includes("air-quality") ? AIR : WEATHER)));

    const ctx = await fetchAirContext(28.47, 77.5);
    expect(ctx.hours.map((h) => h.pm25)).toEqual([80, 120, 130]); // the null hour is skipped, not zero-filled
    expect(ctx.hours[1].usAqi).toBeGreaterThan(0); // provider AQI was null, so it is computed
    expect(ctx.hours[0].usAqi).toBe(160);
    expect(ctx.nowIndex).toBe(1); // 12:00 local among 10,12,13
    expect(ctx.dataNote).toBe("cams_global_25_45km");
    expect(ctx.source).toBe("live");
  });

  it("retries one failed upstream call instead of losing the whole context", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-25T12:30:00Z"));
    let airCalls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (!url.includes("air-quality")) return jsonResponse(WEATHER);
        airCalls++;
        return airCalls === 1 ? jsonResponse({ error: "rate limited" }, 429) : jsonResponse(AIR);
      }),
    );

    const ctx = await fetchAirContext(28.47, 77.5);
    expect(airCalls).toBe(2);
    expect(ctx.hours.length).toBe(3);
  });

  it("rejects a malformed upstream payload instead of serving plausible numbers", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        jsonResponse(
          url.includes("air-quality")
            ? { ...AIR, hourly: { ...AIR.hourly, pm2_5: ["not a number"] } }
            : WEATHER,
        ),
      ),
    );

    await expect(fetchAirContext(28.47, 77.5)).rejects.toThrow();
  });
});

describe("geocoding provider", () => {
  it("maps upstream results and treats an outage as an empty list, never as a fabricated place", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({
          results: [{ id: 1, name: "Noida", latitude: 28.5, longitude: 77.5, country_code: "IN", admin1: "Uttar Pradesh" }],
        }),
      ),
    );
    const [place] = await geocode("Noida");
    expect(place).toEqual({ name: "Noida", lat: 28.5, lon: 77.5, country: "IN", region: "Uttar Pradesh" });

    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ error: "down" }, 500)));
    expect(await geocode("Noida")).toEqual([]);
  });
});
