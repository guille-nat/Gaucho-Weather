/** Types of the S8 API contract (odd/tasks/phase-1-foundation.md). */

export interface User {
  id: number;
  email: string;
  name: string;
}

export const CROPS = ['soja', 'maiz', 'trigo', 'girasol', 'cebada', 'sorgo', 'otro'] as const;
export type Crop = (typeof CROPS)[number];

export interface GeoJsonPolygon {
  type: 'Polygon';
  /** Rings of [longitude, latitude]; the first ring is the outline. */
  coordinates: number[][][];
}

/** Severity of a field decision (S5): the UI never shows it by colour alone. */
export type Level = 'ok' | 'caution' | 'critical';

export interface LoteSummary {
  tonight_min_c_2m: number;
  tonight_min_models: Record<string, number | null>;
  fetched_at: string;
  /** The most urgent decision for the card (S5); absent in caches from before it existed. */
  headline?: { level: Level; text: string } | null;
}

export interface Lote {
  id: number;
  name: string;
  establishment: string;
  locality: string;
  /** JSON numbers; the backend rounds to 6 decimals. */
  latitude: number;
  longitude: number;
  crop: Crop | null;
  sowing_date: string | null;
  area_ha: number | null;
  boundary: GeoJsonPolygon | null;
  summary: LoteSummary | null;
  created_at: string;
  updated_at: string;
}

/** Writable fields sent on POST and PATCH. */
export interface LoteInput {
  name: string;
  establishment: string;
  locality: string;
  latitude: number;
  longitude: number;
  crop: Crop | null;
  sowing_date: string | null;
  area_ha: number | null;
}

/** The list of lotes as cached and persisted: with the time the server produced it. */
export interface LotesSnapshot {
  items: Lote[];
  /** Epoch ms of the server answer (its `Date` header). */
  servedAt: number;
  /** The service worker answered from its cache, so the network was down. */
  fromCache: boolean;
}

/** Sky of a day, as the backend summarises it (S5). */
export type Sky = 'sol' | 'parcial' | 'nublado' | 'lluvia' | 'tormenta';

export interface ForecastNow {
  /** ISO 8601 in America/Argentina/Buenos_Aires, like every time in a forecast. */
  time: string;
  temperature_c: number | null;
  humidity_pct: number | null;
  wind_kmh: number | null;
  wind_dir_deg: number | null;
  gust_kmh: number | null;
}

export interface ForecastDay {
  date: string;
  max_c: number | null;
  min_c: number | null;
  rain_mm: number | null;
  rain_probability_pct: number | null;
  sky: Sky;
}

export interface ForecastHour {
  time: string;
  temperature_c: number | null;
  humidity_pct: number | null;
  wind_kmh: number | null;
  gust_kmh: number | null;
  rain_mm: number | null;
  rain_probability_pct: number | null;
}

export interface FrostDecision {
  level: Level;
  min_2m_c: number | null;
  ground_estimate_c: number | null;
  /** Already worded by the backend: "N de M modelos". */
  models_agreeing: string | null;
  reason: string;
}

export interface SprayDecision {
  level: Level;
  best_window: { start: string; end: string } | null;
  reason: string;
}

export interface FieldWorkDecision {
  level: Level;
  next_rain: { date: string; mm: number; probability_pct: number | null } | null;
  reason: string;
}

export interface Decisions {
  frost_tonight: FrostDecision;
  spray_today: SprayDecision;
  field_work: FieldWorkDecision;
  engine_version: string;
  validated: boolean;
}

/** `GET /api/lotes/{id}/pronostico/` (S5). */
export interface Forecast {
  fetched_at: string;
  models: string[];
  now: ForecastNow;
  today: {
    max_c: number | null;
    min_c: number | null;
    sunrise: string | null;
    sunset: string | null;
  };
  rain_past_7d_mm: number | null;
  daily: ForecastDay[];
  hourly: ForecastHour[];
  decisions: Decisions;
}

export interface PlaceName {
  name: string;
  region: string;
}

/** `GET /api/pronostico/?lat&lon` (S10): the S5 shape plus the name of the place. */
export interface PublicForecast extends Forecast {
  place: PlaceName | null;
}

/** One answer of `GET /api/lugares/?q=` (S10). */
export interface Place extends PlaceName {
  lat: number;
  lon: number;
}

/** A forecast as cached: with the time the server produced it, like `LotesSnapshot`. */
export interface ForecastSnapshot<T extends Forecast = Forecast> {
  forecast: T;
  servedAt: number;
  fromCache: boolean;
}
