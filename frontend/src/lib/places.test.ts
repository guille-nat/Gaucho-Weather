import { describe, expect, it } from 'vitest';
import type { Place } from '../api/types';
import { choosePlace, getPlaces, toggleSaved } from './places';

const place = (name: string, lat: number): Place => ({ name, region: 'Santa Fe', lat, lon: -61 });

describe('saved places (S8)', () => {
  it('keeps a saved place after many newer searches push it out of the recent ones', () => {
    const casilda = place('Casilda', -33.04);
    choosePlace(casilda);
    toggleSaved(casilda);
    for (let i = 0; i < 8; i += 1) choosePlace(place(`Pueblo ${i}`, -30 - i));

    const { saved, recent } = getPlaces();
    expect(saved).toEqual([casilda]);
    expect(recent.some((p) => p.name === 'Casilda')).toBe(false);
  });

  it('forgets a saved place when toggled again, and saves a place only once', () => {
    const casilda = place('Casilda', -33.04);
    toggleSaved(casilda);
    toggleSaved({ ...casilda, lat: casilda.lat + 0.001 });
    expect(getPlaces().saved).toEqual([]);
  });

  it('reads a place list stored before saved places existed', () => {
    localStorage.setItem('gw-places-v1', JSON.stringify({ current: null, recent: [] }));
    expect(getPlaces().saved).toEqual([]);
  });
});
