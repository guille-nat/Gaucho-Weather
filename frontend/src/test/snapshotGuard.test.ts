import { describe, expect, it } from 'vitest';
import { asForecastSnapshot } from '../api/pronostico';

describe('asForecastSnapshot', () => {
  it('drops a persisted entry from an older cache shape instead of crashing', () => {
    // An abandoned build stored the raw forecast under the same query key.
    expect(asForecastSnapshot({ daily: [], hourly: [] })).toBeUndefined();
    expect(asForecastSnapshot(undefined)).toBeUndefined();
  });

  it('keeps a well-formed snapshot', () => {
    const snap = { forecast: { daily: [] }, servedAt: null, fromCache: false };
    expect(asForecastSnapshot(snap)).toBe(snap);
  });
});
