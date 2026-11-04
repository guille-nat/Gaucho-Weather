import { describe, expect, it } from 'vitest';
import { parcelLabel, projectBoundary, seededQuad, type Box } from './parcel';

const box: Box = { x: 0, y: 0, w: 100, h: 100 };

describe('projectBoundary', () => {
  it('fits a polygon inside the box, north up, keeping its proportions', () => {
    // A square-ish field: 0.01° of longitude is narrower than 0.01° of latitude at −33°.
    const points = projectBoundary(
      {
        type: 'Polygon',
        coordinates: [
          [
            [-61.5, -33.5],
            [-61.49, -33.5],
            [-61.49, -33.49],
            [-61.5, -33.49],
            [-61.5, -33.5],
          ],
        ],
      },
      box,
    );
    expect(points).toHaveLength(4);
    const xs = points!.map((p) => p[0]);
    const ys = points!.map((p) => p[1]);
    expect(Math.min(...ys)).toBeCloseTo(0, 1);
    expect(Math.max(...ys)).toBeCloseTo(100, 1);
    const width = Math.max(...xs) - Math.min(...xs);
    expect(width).toBeCloseTo(100 * Math.cos((33.495 * Math.PI) / 180), 0);
    // The southern edge (lat −33.5) is drawn at the bottom.
    expect(points![0]![1]).toBeCloseTo(100, 1);
  });

  it('returns null for an unusable ring', () => {
    expect(projectBoundary({ type: 'Polygon', coordinates: [[[0, 0]]] }, box)).toBeNull();
    expect(projectBoundary(null, box)).toBeNull();
  });
});

describe('seededQuad', () => {
  it('is deterministic per id and stays inside the box', () => {
    expect(seededQuad(7, box)).toEqual(seededQuad(7, box));
    expect(seededQuad(7, box)).not.toEqual(seededQuad(8, box));
    for (const [x, y] of seededQuad(42, box)) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(100);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(100);
    }
  });
});

describe('parcelLabel', () => {
  it('uses the number in the name, else the initial', () => {
    expect(parcelLabel('Lote 12')).toBe('12');
    expect(parcelLabel('Potrero 3 del bajo')).toBe('3');
    expect(parcelLabel('el bajo')).toBe('E');
  });
});
