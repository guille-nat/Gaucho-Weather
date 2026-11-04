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

export interface LoteSummary {
  tonight_min_c_2m: number;
  tonight_min_models: Record<string, number | null>;
  fetched_at: string;
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
