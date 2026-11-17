import type { Forecast, Sky } from '../api/types';
import { currentSky, dayPhase, skyTheme, THEME_COLOR, type SkyTheme } from './sky';

/**
 * The weather of this hour as something to draw (cielo-animado, S4): every effect is read from a
 * datum, so the sky never moves without weather to show (PRODUCT.md rejects clouds that inform
 * nothing).
 */
export interface Scene {
  theme: SkyTheme;
  /** Rain streaks on screen, from the millimetres of this hour. 0 when it is not raining. */
  rain: number;
  /** Horizontal push of a falling streak per pixel of fall, from the wind. */
  slant: number;
  /** Cloud cover of this hour, 0–1, and the number of clouds drawn for it. */
  cover: number;
  clouds: number;
  /** Cloud drift in CSS pixels per second; the sign is the wind's direction on screen. */
  drift: number;
  storm: boolean;
  /** Stars on screen: only on a clear or partly cloudy night, fewer under cloud. */
  stars: number;
  night: boolean;
  /** White the layer may add without taking secondary ink below AA (see whiteBudget). */
  budget: number;
  /** The cloud colour: the sky veiled toward grey at its own luminance (see cloudTone). */
  cloud: [number, number, number];
  moving: boolean;
}

const MAX_RAIN = 160;
const MAX_CLOUDS = 8;
const MAX_STARS = 90;
/** Cover the day's sky implies, for a forecast cached before the hour carried its cover. */
const COVER_OF: Record<Sky, number> = {
  sol: 10,
  parcial: 50,
  nublado: 85,
  lluvia: 95,
  tormenta: 100,
};

type Rgb = [number, number, number];

const toRgb = (hex: string): Rgb => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as Rgb;

const linear = (channel: number) => {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

const luminance = ([r, g, b]: Rgb) => 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);

const asRgb = (colour: string | Rgb): Rgb => (typeof colour === 'string' ? toRgb(colour) : colour);

/** WCAG contrast ratio between two colours. */
export function contrast(a: string | Rgb, b: string | Rgb): number {
  const [x, y] = [luminance(asRgb(a)), luminance(asRgb(b))];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/** The sky with `amount` (0–1) of white painted over it. */
export function mixWhite(sky: string, amount: number): Rgb {
  return toRgb(sky).map((c) => c + (255 - c) * amount) as Rgb;
}

/**
 * The most white the layer may add over a sky and still keep secondary ink (white mixed 88 % into
 * the sky) at 4.5:1 on top of it, with a 10 % margin. A bright day leaves almost nothing; a night
 * leaves plenty.
 */
export function whiteBudget(sky: string): number {
  const ink = mixWhite(sky, 0.88);
  let low = 0;
  let high = 1;
  if (contrast(ink, mixWhite(sky, 0)) < 4.5) return 0;
  for (let i = 0; i < 24; i += 1) {
    const mid = (low + high) / 2;
    if (contrast(ink, mixWhite(sky, mid)) >= 4.5) low = mid;
    else high = mid;
  }
  return low * 0.9;
}

const encode = (value: number) =>
  Math.round(255 * (value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055));

/**
 * The cloud colour: the sky with most of its colour taken out, at exactly the sky's luminance. A
 * cloud desaturates the sky like a veil and never brightens it, so it never lowers contrast; a
 * pure grey read as a stain on a saturated blue.
 */
export function cloudTone(sky: string): Rgb {
  const colour = toRgb(sky).map(linear);
  const target = luminance(toRgb(sky));
  const veiled = colour.map((c) => c * 0.4 + target * 0.6);
  const scale = target / (0.2126 * veiled[0]! + 0.7152 * veiled[1]! + 0.0722 * veiled[2]!);
  return veiled.map((c) => encode(Math.min(1, c * scale))) as Rgb;
}

/** Milliseconds until the next lightning: 6–14 s, so never more than once a second (WCAG 2.3.1). */
export const flashGap = (random: () => number = Math.random) => 6000 + random() * 8000;

export function sceneFor(forecast: Forecast): Scene {
  const theme = skyTheme(forecast);
  const sky = currentSky(forecast);
  const night = dayPhase(forecast) === 'night';
  const { now } = forecast;
  const cover = Math.min(1, Math.max(0, (now.cloud_cover_pct ?? COVER_OF[sky]) / 100));

  const wet = sky === 'lluvia' || sky === 'tormenta';
  const mm = Math.max(now.rain_mm ?? 1, 0.2);
  const rain = wet ? Math.round(Math.min(MAX_RAIN, 24 + Math.sqrt(mm) * 60)) : 0;

  // Wind blows *from* wind_dir_deg; on screen east is right, so it pushes toward dir + 180°.
  const speed = Math.max(0, now.wind_kmh ?? 0);
  const toward = (((now.wind_dir_deg ?? 270) + 180) * Math.PI) / 180;
  const across = Math.sin(toward);
  const sign = across < 0 ? -1 : 1;
  const drift = sign * Math.max(Math.abs(across), 0.35) * (3 + speed * 0.6);
  const slant = Math.max(-0.5, Math.min(0.5, (across * speed) / 50));

  const clouds = cover < 0.1 ? 0 : Math.max(1, Math.round(cover * MAX_CLOUDS));
  const clear = sky === 'sol' || sky === 'parcial';
  const stars = night && clear ? Math.round(MAX_STARS * (1 - cover)) : 0;
  const storm = sky === 'tormenta';

  const colour = THEME_COLOR[theme];
  return {
    theme,
    rain,
    slant,
    cover,
    clouds,
    drift,
    storm,
    stars,
    night,
    budget: whiteBudget(colour),
    cloud: cloudTone(colour),
    moving: rain > 0 || clouds > 0 || stars > 0 || storm,
  };
}
