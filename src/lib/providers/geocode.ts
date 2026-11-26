/**
 * Geocoding via Open-Meteo (§5.1).
 */
import { z } from "zod";

const GEO_BASE = "https://geocoding-api.open-meteo.com/v1/search";

const ResultSchema = z.object({
  id: z.number(),
  name: z.string(),
  latitude: z.number(),
  longitude: z.number(),
  country_code: z.string().optional(),
  country: z.string().optional(),
  admin1: z.string().optional(),
});

const GeoResponseSchema = z.object({
  results: z.array(ResultSchema).optional(),
});

export interface GeoResult {
  name: string;
  lat: number;
  lon: number;
  country: string;
  region?: string;
}

export async function geocode(query: string): Promise<GeoResult[]> {
  if (!query || query.length > 80) return [];
  const url = `${GEO_BASE}?name=${encodeURIComponent(query)}&count=5&language=en&format=json`;
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(id);
    if (!res.ok) return [];
    const json = await res.json();
    const data = GeoResponseSchema.parse(json);
    return (data.results ?? []).map((r) => ({
      name: r.name,
      lat: r.latitude,
      lon: r.longitude,
      country: r.country_code ?? "",
      region: r.admin1,
    }));
  } catch {
    clearTimeout(id);
    return [];
  }
}
