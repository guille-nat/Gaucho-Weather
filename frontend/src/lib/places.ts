import { useSyncExternalStore } from 'react';
import type { Place } from '../api/types';

/**
 * The places this phone remembers (S8), in localStorage: the place on screen and the recent
 * searches. They are public names, not account data, so they survive a logout.
 */
export interface CurrentPlace {
  /** `gps`: where the phone is (its name comes from the reverse lookup); `search`: chosen. */
  kind: 'gps' | 'search';
  lat: number;
  lon: number;
  name: string | null;
  region: string | null;
}

interface PlacesState {
  current: CurrentPlace | null;
  recent: Place[];
}

const KEY = 'gw-places-v1';
const MAX_RECENT = 6;

/** Where Inicio starts when the phone does not share its location and nothing was chosen. */
export const DEFAULT_PLACE: CurrentPlace = {
  kind: 'search',
  lat: -32.947,
  lon: -60.639,
  name: 'Rosario',
  region: 'Santa Fe',
};

const EMPTY: PlacesState = { current: null, recent: [] };
let cached: { raw: string | null; state: PlacesState } | null = null;
const listeners = new Set<() => void>();

function read(): PlacesState {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    // Storage blocked (private mode): the app still works, it just forgets.
  }
  if (cached && cached.raw === raw) return cached.state;
  let state = EMPTY;
  try {
    const parsed = raw ? (JSON.parse(raw) as Partial<PlacesState>) : null;
    if (parsed) state = { current: parsed.current ?? null, recent: parsed.recent ?? [] };
  } catch {
    // A broken entry is ignored, not fatal.
  }
  cached = { raw, state };
  return state;
}

function write(next: PlacesState) {
  const raw = JSON.stringify(next);
  try {
    localStorage.setItem(KEY, raw);
  } catch {
    // Kept in memory for this visit only.
  }
  cached = { raw, state: next };
  listeners.forEach((notify) => notify());
}

const samePlace = (a: { lat: number; lon: number }, b: { lat: number; lon: number }) =>
  Math.abs(a.lat - b.lat) < 0.005 && Math.abs(a.lon - b.lon) < 0.005;

export function setCurrentPlace(current: CurrentPlace) {
  write({ ...read(), current });
}

/** Shows a searched place and puts it first among the recent ones. */
export function choosePlace(place: Place) {
  const state = read();
  const recent = [place, ...state.recent.filter((p) => !samePlace(p, place))].slice(0, MAX_RECENT);
  write({
    current: {
      kind: 'search',
      lat: place.lat,
      lon: place.lon,
      name: place.name,
      region: place.region,
    },
    recent,
  });
}

function subscribe(notify: () => void) {
  listeners.add(notify);
  const onStorage = (event: StorageEvent) => event.key === KEY && notify();
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(notify);
    window.removeEventListener('storage', onStorage);
  };
}

/** The places right now, outside React (e.g. for an initial state). */
export const getPlaces = read;

export function usePlaces(): PlacesState {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}
