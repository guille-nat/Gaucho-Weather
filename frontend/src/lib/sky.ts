import type { Forecast, Sky } from '../api/types';
import { TIME_ZONE } from './format';

/**
 * The colour of the screen (S9, "Cielo vivo"): the sky of the place, by the condition of this
 * hour and the time of day.
 * Each theme is a pair of colours in styles/tokens.css, checked for AA with white text.
 */
export type SkyTheme =
  | 'dia'
  | 'parcial'
  | 'nublado'
  | 'lluvia'
  | 'tormenta'
  | 'alba'
  | 'noche'
  | 'noche-nublada'
  | 'noche-lluvia';

export type DayPhase = 'day' | 'twilight' | 'night';

const TWILIGHT_MS = 45 * 60_000;
const hourIn = new Intl.DateTimeFormat('en-GB', {
  hour: 'numeric',
  hourCycle: 'h23',
  timeZone: TIME_ZONE,
});

export function dayPhase(forecast: Forecast): DayPhase {
  const now = Date.parse(forecast.now.time);
  const { sunrise, sunset } = forecast.today;
  if (sunrise && sunset) {
    const rise = Date.parse(sunrise);
    const set = Date.parse(sunset);
    if (Math.abs(now - rise) <= TWILIGHT_MS || Math.abs(now - set) <= TWILIGHT_MS)
      return 'twilight';
    return now > rise && now < set ? 'day' : 'night';
  }
  // No sun times in the archive: a plain clock, good enough for a colour.
  const hour = Number(hourIn.format(now));
  return hour >= 7 && hour < 20 ? 'day' : 'night';
}

export const todaySky = (forecast: Forecast): Sky => forecast.daily[0]?.sky ?? 'parcial';

/** The sky of this hour (S3 of cielo-animado); a forecast cached before it falls back to today. */
export const currentSky = (forecast: Forecast): Sky => forecast.now.sky ?? todaySky(forecast);

export function skyTheme(forecast: Forecast): SkyTheme {
  const sky = currentSky(forecast);
  const phase = dayPhase(forecast);
  if (sky === 'tormenta') return 'tormenta';
  if (phase === 'night') {
    if (sky === 'lluvia') return 'noche-lluvia';
    if (sky === 'nublado') return 'noche-nublada';
    return 'noche';
  }
  if (phase === 'twilight' && (sky === 'sol' || sky === 'parcial')) return 'alba';
  return sky === 'sol' ? 'dia' : sky;
}

export function conditionLabel(forecast: Forecast): string {
  const sky = currentSky(forecast);
  const night = dayPhase(forecast) === 'night';
  switch (sky) {
    case 'sol':
      return night ? 'Despejado' : 'Soleado';
    case 'parcial':
      return 'Parcialmente nublado';
    case 'nublado':
      return 'Nublado';
    case 'lluvia':
      return 'Lluvia';
    case 'tormenta':
      return 'Tormenta';
  }
}

/** The browser bar takes the top colour of each theme (kept in sync with tokens.css). */
export const THEME_COLOR: Record<SkyTheme, string> = {
  dia: '#1d68c4',
  parcial: '#2f68aa',
  nublado: '#506283',
  lluvia: '#1d5a73',
  tormenta: '#4a3a8f',
  alba: '#b04530',
  noche: '#1a2b5c',
  'noche-nublada': '#2d3a57',
  'noche-lluvia': '#163f57',
};

const STORAGE_KEY = 'gw-sky';

/** Paints the whole app with a sky; the CSS cross-fades from the previous one. */
export function applySky(theme: SkyTheme) {
  const root = document.documentElement;
  if (root.dataset.sky === theme) return;
  root.dataset.sky = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[theme]);
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Next visit starts on the default sky.
  }
}

/** The last sky seen on this phone, so the app opens on it instead of flashing another. */
export function restoreSky() {
  let theme: string | null = null;
  try {
    theme = localStorage.getItem(STORAGE_KEY);
  } catch {
    // Default sky.
  }
  applySky(theme && theme in THEME_COLOR ? (theme as SkyTheme) : 'dia');
}
