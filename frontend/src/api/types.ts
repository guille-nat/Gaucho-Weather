/** Types of the S8 API contract (odd/tasks/phase-1-foundation.md). */

export type PlanCode = 'basico' | 'productor' | 'empresa';

/** A plan of GET /api/planes/ and of the account (odd/tasks/cuenta-planes-alertas.md S1). */
export interface Plan {
  code: PlanCode;
  name: string;
  /** ARS per month; null until it is set ("Precio a confirmar"). */
  price_ars_month: number | null;
  /** null = no limit. */
  max_lotes: number | null;
  max_alert_rules: number | null;
  allows_push: boolean;
  priority_support: boolean;
  highlighted: boolean;
}

export interface PlansInfo {
  plans: Plan[];
  founders: { limit: number; remaining: number };
  trial_days: number;
}

export interface User {
  id: number;
  email: string;
  name: string;
  // The plan fields are absent in a `me` persisted by a build from before plans existed.
  plan?: Plan;
  /** ISO date; null when the plan does not expire (founders, paid plans). */
  plan_expires_at?: string | null;
  founder_number?: number | null;
  usage?: { lotes: number };
  notify_push?: boolean;
  notify_email?: boolean;
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
  /** The drawn outline (S7), or null to clear it. */
  boundary: GeoJsonPolygon | null;
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

/** One local day of `GET /api/lotes/{id}/historico/` (cuenta-planes-alertas S10). */
export interface HistoryDay {
  date: string;
  temp_max_c: number | null;
  temp_min_c: number | null;
  rain_mm: number | null;
  wind_max_kmh: number | null;
  gust_max_kmh: number | null;
  /** Hours stored for the day: fewer than 24 on a past day means it is still loading. */
  hours: number;
}

/** One past hour of a lote (S9): wind at 10 m and the engine's spray wind range. */
export interface HistoryHour {
  /** Local time with its offset, e.g. `2026-11-15T09:00:00-03:00`. */
  time: string;
  temperature_c: number | null;
  humidity_pct: number | null;
  rain_mm: number | null;
  wind_kmh: number | null;
  wind_dir_deg: number | null;
  gust_kmh: number | null;
  /** `null` when the hour has no wind to rate. */
  spray_wind: Level | null;
  spray_wind_causes: string[];
}

/** `GET /api/lotes/{id}/historico/?desde&hasta` (S9, S10): modelled, not measured on the lote. */
export interface LoteHistory {
  from: string;
  to: string;
  source: string;
  attribution: string;
  /** False while some past day of the range lacks hours. */
  complete: boolean;
  days: HistoryDay[];
  hours: HistoryHour[];
}
