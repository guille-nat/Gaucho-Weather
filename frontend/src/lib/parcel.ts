import type { GeoJsonPolygon } from '../api/types';

export type Point = [number, number];
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

const round = (n: number) => Math.round(n * 10) / 10;

/**
 * Projects a GeoJSON polygon's outer ring into `box`, north up, keeping proportions.
 * Equirectangular with a cos(latitude) correction: exact enough at the scale of one field.
 */
export function projectBoundary(polygon: GeoJsonPolygon | null, box: Box): Point[] | null {
  const ring = polygon?.coordinates?.[0];
  if (!ring) return null;
  const points = ring.filter(
    (p): p is [number, number] => p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]),
  );
  const first = points[0];
  const last = points[points.length - 1];
  if (first && last && points.length > 1 && first[0] === last[0] && first[1] === last[1]) {
    points.pop();
  }
  if (points.length < 3) return null;

  const meanLat = points.reduce((sum, p) => sum + p[1], 0) / points.length;
  const k = Math.cos((meanLat * Math.PI) / 180);
  const planar = points.map(([lon, lat]) => [lon * k, -lat] as Point);
  const xs = planar.map((p) => p[0]);
  const ys = planar.map((p) => p[1]);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const spanX = Math.max(...xs) - minX;
  const spanY = Math.max(...ys) - minY;
  if (spanX === 0 && spanY === 0) return null;
  const scale = Math.min(spanX ? box.w / spanX : Infinity, spanY ? box.h / spanY : Infinity);
  const offsetX = box.x + (box.w - spanX * scale) / 2;
  const offsetY = box.y + (box.h - spanY * scale) / 2;
  return planar.map(([x, y]) => [
    round(offsetX + (x - minX) * scale),
    round(offsetY + (y - minY) * scale),
  ]);
}

/** Small deterministic PRNG (mulberry32), so a lote keeps its shape between visits. */
function random(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A believable field quadrilateral when the real boundary is unknown, seeded by the lote id. */
export function seededQuad(seed: number, box: Box): Point[] {
  const next = random(seed * 2654435761);
  const jitter = (from: number, span: number) => from + next() * span;
  const { x, y, w, h } = box;
  return [
    [jitter(x, w * 0.28), jitter(y, h * 0.28)],
    [jitter(x + w * 0.72, w * 0.28), jitter(y, h * 0.28)],
    [jitter(x + w * 0.72, w * 0.28), jitter(y + h * 0.72, h * 0.28)],
    [jitter(x, w * 0.28), jitter(y + h * 0.72, h * 0.28)],
  ].map(([px, py]) => [round(px!), round(py!)] as Point);
}

/** The mark written inside the parcel: the number in its name, else its initial. */
export function parcelLabel(name: string): string {
  const number = name.match(/\d{1,4}/)?.[0];
  if (number) return number;
  return (name.trim().charAt(0) || '·').toUpperCase();
}
