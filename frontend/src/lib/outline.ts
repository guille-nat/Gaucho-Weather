import type { GeoJsonPolygon } from '../api/types';

/** A corner of a lote as GeoJSON orders it: [longitude, latitude]. */
export type LngLat = [number, number];

/** The outline the farmer draws on the map (S7): corners in order, open until closed. */
export interface Outline {
  points: LngLat[];
  closed: boolean;
}

export type OutlineAction =
  | { type: 'add'; point: LngLat }
  | { type: 'undo' }
  | { type: 'close' }
  | { type: 'move'; index: number; point: LngLat }
  | { type: 'insert'; index: number; point: LngLat }
  | { type: 'remove'; index: number }
  | { type: 'clear' };

export const EMPTY_OUTLINE: Outline = { points: [], closed: false };

/** A polygon needs three corners; below that there is nothing to close or measure. */
export const MIN_CORNERS = 3;

export function outlineReducer(state: Outline, action: OutlineAction): Outline {
  switch (action.type) {
    case 'add':
      return state.closed ? state : { ...state, points: [...state.points, action.point] };
    case 'undo':
      // Closing was the last step, so undoing it reopens the outline with its corners.
      if (state.closed) return { ...state, closed: false };
      return state.points.length ? { ...state, points: state.points.slice(0, -1) } : state;
    case 'close':
      return state.points.length >= MIN_CORNERS ? { ...state, closed: true } : state;
    case 'move':
      if (!state.points[action.index]) return state;
      return {
        ...state,
        points: state.points.map((p, i) => (i === action.index ? action.point : p)),
      };
    case 'insert': {
      const points = [...state.points];
      points.splice(action.index, 0, action.point);
      return { ...state, points };
    }
    case 'remove':
      if (!state.points[action.index]) return state;
      if (state.closed && state.points.length <= MIN_CORNERS) return state;
      return { ...state, points: state.points.filter((_, i) => i !== action.index) };
    case 'clear':
      return EMPTY_OUTLINE;
  }
}

/** Drops a repeated closing corner, as GeoJSON rings carry one. */
function openRing(points: LngLat[]): LngLat[] {
  const first = points[0];
  const last = points[points.length - 1];
  if (first && last && points.length > 1 && first[0] === last[0] && first[1] === last[1]) {
    return points.slice(0, -1);
  }
  return points;
}

const EARTH_RADIUS_M = 6378137;
const rad = (deg: number) => (deg * Math.PI) / 180;

/**
 * Geodesic area of a ring in hectares, on the WGS84 sphere (Chamberlain & Duquette,
 * "Some algorithms for polygons on a sphere", JPL 2007; the method of @turf/area).
 * At the size of a field it agrees with the ellipsoid to well under 1 %.
 */
export function areaHa(corners: LngLat[]): number {
  const points = openRing(corners);
  const n = points.length;
  if (n < MIN_CORNERS) return 0;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const lower = points[i]!;
    const middle = points[(i + 1) % n]!;
    const upper = points[(i + 2) % n]!;
    sum += (rad(upper[0]) - rad(lower[0])) * Math.sin(rad(middle[1]));
  }
  return Math.abs((sum * EARTH_RADIUS_M * EARTH_RADIUS_M) / 2) / 10_000;
}

/** Hectares with two decimals, as the backend stores them. */
export const roundHa = (value: number) => Math.round(value * 100) / 100;

/**
 * Area-weighted centroid in a local equirectangular plane (cos latitude), exact enough for
 * one field. Falls back to the mean of the corners for a degenerate (zero-area) shape.
 */
export function centroid(corners: LngLat[]): LngLat | null {
  const points = openRing(corners);
  const n = points.length;
  if (n < MIN_CORNERS) return null;
  const meanLat = points.reduce((s, p) => s + p[1], 0) / n;
  const k = Math.cos(rad(meanLat));
  const [ox, oy] = points[0]!;
  const xy = points.map(([lon, lat]): LngLat => [(lon - ox) * k, lat - oy]);
  let twiceArea = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < n; i++) {
    const [x0, y0] = xy[i]!;
    const [x1, y1] = xy[(i + 1) % n]!;
    const cross = x0 * y1 - x1 * y0;
    twiceArea += cross;
    cx += (x0 + x1) * cross;
    cy += (y0 + y1) * cross;
  }
  if (Math.abs(twiceArea) < 1e-18) {
    return [points.reduce((s, p) => s + p[0], 0) / n, meanLat];
  }
  return [ox + cx / (3 * twiceArea) / k, oy + cy / (3 * twiceArea)];
}

const six = (value: number) => Number(value.toFixed(6));

/** The saved `boundary` (S7): a closed ring, 6 decimals like the lote's coordinates. */
export function toPolygon(outline: Outline): GeoJsonPolygon | null {
  if (!outline.closed || outline.points.length < MIN_CORNERS) return null;
  const ring = outline.points.map(([lon, lat]) => [six(lon), six(lat)]);
  return { type: 'Polygon', coordinates: [[...ring, ring[0]!]] };
}

export function outlineFromPolygon(polygon: GeoJsonPolygon | null | undefined): Outline {
  const ring = polygon?.coordinates?.[0];
  if (!ring) return EMPTY_OUTLINE;
  const points = openRing(
    ring
      .filter((p) => p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]))
      .map((p) => [p[0]!, p[1]!] as LngLat),
  );
  return points.length >= MIN_CORNERS ? { points, closed: true } : EMPTY_OUTLINE;
}
