/**
 * Open-Meteo air quality and weather provider (§5.1).
 * Server-side only. Validates upstream JSON with Zod. 5s timeout, 1 retry.
 */
import { z } from "zod";
import type { HourPoint, AirContext } from "../types";
import { aqiFromPm25 } from "../engine/bands";

const AIR_BASE = "https://air-quality-api.open-meteo.com/v1/air-quality";
const WEATHER_BASE = "https://api.open-meteo.com/v1/forecast";

const HourlyAirSchema = z.object({
  time: z.array(z.string()),
  pm2_5: z.array(z.number().nullable()),
  pm10: z.array(z.number().nullable()),
  us_aqi: z.array(z.number().nullable()),
});

const AirResponseSchema = z.object({
  hourly: HourlyAirSchema,
  utc_offset_seconds: z.number().optional(),
  current: z.object({
    us_aqi: z.number().nullable().optional(),
    pm2_5: z.number().nullable().optional(),
    pm10: z.number().nullable().optional(),
  }).optional(),
});

const HourlyWeatherSchema = z.object({
  time: z.array(z.string()),
  temperature_2m: z.array(z.number().nullable()),
  relative_humidity_2m: z.array(z.number().nullable()),
  wind_speed_10m: z.array(z.number().nullable()),
});

const WeatherResponseSchema = z.object({
  hourly: HourlyWeatherSchema,
});

async function fetchWithTimeout(url: string, timeoutMs = 5000): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal, next: { revalidate: 3600 } });
    return res;
  } finally {
    clearTimeout(id);
  }
}

async function fetchWithRetry(url: string, retries = 1): Promise<Response> {
  try {
    const res = await fetchWithTimeout(url);
    if (!res.ok && retries > 0) return fetchWithRetry(url, retries - 1);
    return res;
  } catch {
    if (retries > 0) return fetchWithRetry(url, retries - 1);
    throw new Error(`Failed to fetch ${url}`);
  }
}

/** Round lat/lon to 0.1° for cache key */
function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function isEurope(lat: number, lon: number): boolean {
  return lat >= 35 && lat <= 72 && lon >= -25 && lon <= 45;
}

export async function fetchAirContext(
  lat: number,
  lon: number,
): Promise<AirContext & { weatherHours?: { tempC: number; rh: number; windKmh: number }[] }> {
  const rlat = round1(lat);
  const rlon = round1(lon);

  const airUrl = `${AIR_BASE}?latitude=${rlat}&longitude=${rlon}&hourly=pm2_5,pm10,us_aqi&current=us_aqi,pm2_5,pm10&past_days=1&forecast_days=2&timezone=auto`;
  const weatherUrl = `${WEATHER_BASE}?latitude=${rlat}&longitude=${rlon}&hourly=temperature_2m,relative_humidity_2m,wind_speed_10m&past_days=1&forecast_days=2&timezone=auto`;

  const [airRes, weatherRes] = await Promise.all([
    fetchWithRetry(airUrl),
    fetchWithRetry(weatherUrl),
  ]);

  const airJson = await airRes.json();
  const weatherJson = await weatherRes.json();

  const air = AirResponseSchema.parse(airJson);
  const weather = WeatherResponseSchema.parse(weatherJson);

  // Build hour points
  const hours: HourPoint[] = [];
  const len = Math.min(
    air.hourly.time.length,
    air.hourly.pm2_5.length,
    air.hourly.pm10.length,
    air.hourly.us_aqi.length,
  );

  for (let i = 0; i < len; i++) {
    const pm25 = air.hourly.pm2_5[i];
    const pm10 = air.hourly.pm10[i];
    const aqi = air.hourly.us_aqi[i];
    if (pm25 === null || pm10 === null) continue;

    const hp: HourPoint = {
      t: air.hourly.time[i],
      pm25,
      pm10,
      // Provider AQI is shown as a secondary value; a missing value must not drop a usable hour.
      usAqi: aqi ?? aqiFromPm25(pm25),
    };

    // Add weather data if available
    if (i < weather.hourly.time.length) {
      const temp = weather.hourly.temperature_2m[i];
      const rh = weather.hourly.relative_humidity_2m[i];
      const wind = weather.hourly.wind_speed_10m[i];
      if (temp !== null) hp.tempC = temp;
      if (rh !== null) hp.rh = rh;
      if (wind !== null) hp.windKmh = wind;
    }

    hours.push(hp);
  }

  // Find nowIndex using the location's UTC offset (Open-Meteo returns local time strings).
  const now = new Date();
  const offsetMs = (air.utc_offset_seconds ?? 0) * 1000;
  const nowLocalStr = new Date(now.getTime() + offsetMs).toISOString().slice(0, 13);
  let nowIndex = 0;
  for (let i = 0; i < hours.length; i++) {
    if (hours[i].t.slice(0, 13) <= nowLocalStr) nowIndex = i;
  }

  const dataNote = isEurope(lat, lon) ? "cams_europe_11km" as const : "cams_global_25_45km" as const;

  return {
    place: { name: "", lat: rlat, lon: rlon, country: "" },
    source: "live",
    dataNote,
    fetchedAt: now.toISOString(),
    hours,
    nowIndex,
  };
}
