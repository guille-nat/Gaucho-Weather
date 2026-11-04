import { apiFetch, apiGetServed } from './client';
import type { Forecast, ForecastSnapshot, Place, PlaceName, PublicForecast } from './types';

/** Coordinates go out with 3 decimals (~100 m): the backend works on 0.1° cells anyway. */
const coord = (value: number) => value.toFixed(3);

export async function getForecast(lat: number, lon: number) {
  const path = `/api/pronostico/?lat=${coord(lat)}&lon=${coord(lon)}`;
  const { data, servedAt, fromCache } = await apiGetServed<PublicForecast>(path);
  return { forecast: data, servedAt, fromCache } satisfies ForecastSnapshot<PublicForecast>;
}

/**
 * Accepts only the current snapshot shape. A persisted entry written by an
 * older build under the same query key is treated as missing, never rendered.
 */
export function asForecastSnapshot(value: unknown): ForecastSnapshot | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const forecast = (value as { forecast?: unknown }).forecast;
  if (typeof forecast !== 'object' || forecast === null) return undefined;
  return value as ForecastSnapshot;
}

export async function getLoteForecast(id: number) {
  const { data, servedAt, fromCache } = await apiGetServed<Forecast>(
    `/api/lotes/${id}/pronostico/`,
  );
  return { forecast: data, servedAt, fromCache } satisfies ForecastSnapshot;
}

export const searchPlaces = (query: string, signal?: AbortSignal) =>
  apiFetch<Place[]>(`/api/lugares/?q=${encodeURIComponent(query)}`, { signal });

export const reversePlace = (lat: number, lon: number) =>
  apiFetch<PlaceName | null>(`/api/lugares/reverso/?lat=${coord(lat)}&lon=${coord(lon)}`);
