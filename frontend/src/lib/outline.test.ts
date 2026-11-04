import { describe, expect, it } from 'vitest';
import {
  EMPTY_OUTLINE,
  areaHa,
  centroid,
  outlineFromPolygon,
  outlineReducer,
  toPolygon,
  type LngLat,
  type Outline,
} from './outline';

// One kilometre north–south and east–west on the WGS84 sphere used by GeoJSON tools.
const R = 6378137;
const LAT = -33.3;
const LON = -61.6;
const dLat = (1000 / R) * (180 / Math.PI);
const dLon = dLat / Math.cos((LAT * Math.PI) / 180);
const SQUARE: [LngLat, LngLat, LngLat, LngLat] = [
  [LON, LAT],
  [LON + dLon, LAT],
  [LON + dLon, LAT + dLat],
  [LON, LAT + dLat],
];

const apply = (outline: Outline, ...actions: Parameters<typeof outlineReducer>[1][]) =>
  actions.reduce(outlineReducer, outline);

describe('areaHa', () => {
  it('measures a 1 km × 1 km square as about 100 ha', () => {
    expect(Math.abs(areaHa(SQUARE) - 100) / 100).toBeLessThan(0.01);
  });

  it('does not depend on the drawing direction or a repeated closing corner', () => {
    const reversed = [...SQUARE].reverse();
    expect(areaHa(reversed)).toBeCloseTo(areaHa(SQUARE), 6);
    expect(areaHa([...SQUARE, SQUARE[0]])).toBeCloseTo(areaHa(SQUARE), 6);
  });

  it('is zero with fewer than three corners', () => {
    expect(areaHa(SQUARE.slice(0, 2))).toBe(0);
  });
});

describe('centroid', () => {
  it('is the middle of a square', () => {
    const [lon, lat] = centroid(SQUARE)!;
    expect(lon).toBeCloseTo(LON + dLon / 2, 6);
    expect(lat).toBeCloseTo(LAT + dLat / 2, 6);
  });

  it('is null without a shape', () => {
    expect(centroid(SQUARE.slice(0, 2))).toBeNull();
  });
});

describe('toPolygon and outlineFromPolygon', () => {
  it('writes a closed GeoJSON ring rounded to 6 decimals', () => {
    const polygon = toPolygon({
      points: [[-61.12345678, -33.1], ...SQUARE.slice(1)],
      closed: true,
    });
    const ring = polygon!.coordinates[0]!;
    expect(polygon!.type).toBe('Polygon');
    expect(ring).toHaveLength(5);
    expect(ring[0]).toEqual(ring[4]);
    expect(ring[0]).toEqual([-61.123457, -33.1]);
  });

  it('gives no polygon while the outline is open', () => {
    expect(toPolygon({ points: SQUARE, closed: false })).toBeNull();
  });

  it('reads a saved polygon back as a closed outline', () => {
    const outline = outlineFromPolygon(toPolygon({ points: SQUARE, closed: true }));
    expect(outline.closed).toBe(true);
    expect(outline.points).toHaveLength(4);
    expect(outlineFromPolygon(null)).toEqual(EMPTY_OUTLINE);
  });
});

describe('outlineReducer', () => {
  const [a, b, c, d] = SQUARE;

  it('adds corners and undoes the last one', () => {
    const drawn = apply(EMPTY_OUTLINE, { type: 'add', point: a }, { type: 'add', point: b });
    expect(drawn.points).toEqual([a, b]);
    expect(apply(drawn, { type: 'undo' }).points).toEqual([a]);
  });

  it('closes only with three corners or more', () => {
    const two = apply(EMPTY_OUTLINE, { type: 'add', point: a }, { type: 'add', point: b });
    expect(apply(two, { type: 'close' }).closed).toBe(false);
    const three = apply(two, { type: 'add', point: c }, { type: 'close' });
    expect(three.closed).toBe(true);
  });

  it('ignores new corners once closed, and undo reopens it', () => {
    const closed = apply(
      EMPTY_OUTLINE,
      { type: 'add', point: a },
      { type: 'add', point: b },
      { type: 'add', point: c },
      { type: 'close' },
    );
    expect(apply(closed, { type: 'add', point: d }).points).toHaveLength(3);
    const reopened = apply(closed, { type: 'undo' });
    expect(reopened).toEqual({ points: [a, b, c], closed: false });
  });

  it('moves, inserts and removes corners, keeping at least three when closed', () => {
    const closed: Outline = { points: [a, b, c], closed: true };
    expect(apply(closed, { type: 'move', index: 1, point: d }).points).toEqual([a, d, c]);
    expect(apply(closed, { type: 'insert', index: 1, point: d }).points).toEqual([a, d, b, c]);
    expect(apply(closed, { type: 'remove', index: 0 })).toBe(closed);
    const four: Outline = { points: [a, b, c, d], closed: true };
    expect(apply(four, { type: 'remove', index: 0 }).points).toEqual([b, c, d]);
  });

  it('clears everything', () => {
    const closed: Outline = { points: [a, b, c], closed: true };
    expect(apply(closed, { type: 'clear' })).toEqual(EMPTY_OUTLINE);
  });
});
