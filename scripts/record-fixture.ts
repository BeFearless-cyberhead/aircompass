#!/usr/bin/env node
/**
 * Record a real severe-winter-day demo fixture from Open-Meteo (§5.1).
 *
 * Usage: npm run sample:record
 *
 * Picks the worst contiguous 24 h PM2.5 window in the last 14 days for the
 * sample place, keeps the 24 h before it for the NAQI trailing average, and
 * writes data/demo-fixture.json with the real recorded date. The demo is
 * labelled "Recorded <date>" in the UI; never label synthetic data as recorded.
 */
import { writeFileSync } from "node:fs";

const SAMPLE_PLACE = { name: "Greater Noida", lat: 28.47, lon: 77.5, country: "IN" };
const AIR = "https://air-quality-api.open-meteo.com/v1/air-quality";
const WEATHER = "https://api.open-meteo.com/v1/forecast";

interface UpstreamHourly {
  time: string[];
  pm2_5: (number | null)[];
  pm10: (number | null)[];
  us_aqi: (number | null)[];
}

async function getJson(url: string): Promise<Record<string, unknown>> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return (await res.json()) as Record<string, unknown>;
}

async function main() {
  const airUrl =
    `${AIR}?latitude=${SAMPLE_PLACE.lat}&longitude=${SAMPLE_PLACE.lon}` +
    "&hourly=pm2_5,pm10,us_aqi&past_days=14&forecast_days=1&timezone=auto";
  const weatherUrl =
    `${WEATHER}?latitude=${SAMPLE_PLACE.lat}&longitude=${SAMPLE_PLACE.lon}` +
    "&hourly=temperature_2m,relative_humidity_2m,wind_speed_10m&past_days=14&forecast_days=1&timezone=auto";

  const [airJson, weatherJson] = await Promise.all([getJson(airUrl), getJson(weatherUrl)]);
  const air = (airJson.hourly ?? {}) as UpstreamHourly;
  const weather = (weatherJson.hourly ?? {}) as {
    time?: string[];
    temperature_2m?: (number | null)[];
    relative_humidity_2m?: (number | null)[];
    wind_speed_10m?: (number | null)[];
  };

  if (!Array.isArray(air.time) || !Array.isArray(air.pm2_5)) {
    throw new Error("Upstream response is missing hourly arrays");
  }

  const rows = air.time
    .map((t, i) => ({
      t,
      pm25: air.pm2_5[i],
      pm10: air.pm10?.[i],
      usAqi: air.us_aqi?.[i],
      tempC: weather.temperature_2m?.[i] ?? undefined,
      rh: weather.relative_humidity_2m?.[i] ?? undefined,
      windKmh: weather.wind_speed_10m?.[i] ?? undefined,
    }))
    .filter((r): r is typeof r & { pm25: number; pm10: number } =>
      typeof r.pm25 === "number" && typeof r.pm10 === "number" && Number.isFinite(r.pm25),
    );

  if (rows.length < 48) throw new Error(`Only ${rows.length} valid hours; need at least 48`);

  // Worst contiguous 24 h window by mean PM2.5.
  let worstStart = 0;
  let worstMean = -Infinity;
  for (let s = 0; s + 24 <= rows.length; s++) {
    let sum = 0;
    for (let i = s; i < s + 24; i++) sum += rows[i].pm25;
    const mean = sum / 24;
    if (mean > worstMean) {
      worstMean = mean;
      worstStart = s;
    }
  }

  const saveStart = Math.max(0, worstStart - 24);
  const saveEnd = Math.min(rows.length, worstStart + 24 + 24);
  const hours = rows.slice(saveStart, saveEnd).map((r) => ({
    t: r.t,
    pm25: r.pm25,
    pm10: r.pm10,
    usAqi: typeof r.usAqi === "number" ? r.usAqi : 0,
    ...(typeof r.tempC === "number" ? { tempC: r.tempC } : {}),
    ...(typeof r.rh === "number" ? { rh: r.rh } : {}),
    ...(typeof r.windKmh === "number" ? { windKmh: r.windKmh } : {}),
  }));

  const fixture = {
    place: SAMPLE_PLACE,
    source: "recorded" as const,
    recordedDate: rows[worstStart].t.slice(0, 10),
    recordedAt: new Date().toISOString(),
    windowStart: rows[worstStart].t,
    windowMeanPm25: Math.round(worstMean * 10) / 10,
    nowIndex: worstStart - saveStart,
    hours,
  };

  const path = new URL("../data/demo-fixture.json", import.meta.url);
  writeFileSync(path, JSON.stringify(fixture, null, 2) + "\n");
  console.log(
    `wrote ${path.pathname}\nrecorded ${fixture.hours.length} h, worst day ${fixture.recordedDate} (mean PM2.5 ${fixture.windowMeanPm25} µg/m³)`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
