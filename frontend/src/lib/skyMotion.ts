import { useSyncExternalStore } from 'react';
import { flashGap, type Scene } from './atmosphere';

/*
 * The animated sky (cielo-animado, S4–S5): a canvas behind the forecast that draws the weather of
 * this hour. It runs at about 30 frames a second, caps the pixel ratio at 2, and stops with the
 * page (requestAnimationFrame does not run while the tab is hidden). With reduced motion, or when
 * the farmer pauses it, it draws one still frame.
 */

const PAUSE_KEY = 'gw-sky-motion';
const FRAME_MS = 1000 / 30;
/** The phone the counts in a Scene are tuned for; larger screens get proportionally more. */
const BASE_AREA = 390 * 844;

const listeners = new Set<() => void>();
/** Used when storage is blocked (private mode): remembered for this visit only. */
let pausedInMemory = false;

function readPaused(): boolean {
  try {
    return localStorage.getItem(PAUSE_KEY) === 'paused';
  } catch {
    return pausedInMemory;
  }
}

export function setSkyPaused(paused: boolean) {
  pausedInMemory = paused;
  try {
    if (paused) localStorage.setItem(PAUSE_KEY, 'paused');
    else localStorage.removeItem(PAUSE_KEY);
  } catch {
    // Kept in memory instead.
  }
  listeners.forEach((notify) => notify());
}

function subscribePaused(notify: () => void) {
  listeners.add(notify);
  const onStorage = (event: StorageEvent) => event.key === PAUSE_KEY && notify();
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(notify);
    window.removeEventListener('storage', onStorage);
  };
}

/** Whether the farmer paused the sky on this phone (WCAG 2.2.2). */
export const useSkyPaused = () => useSyncExternalStore(subscribePaused, readPaused, () => false);

const REDUCE = '(prefers-reduced-motion: reduce)';

function subscribeReduced(notify: () => void) {
  const query = window.matchMedia?.(REDUCE);
  query?.addEventListener?.('change', notify);
  return () => query?.removeEventListener?.('change', notify);
}

export const useReducedMotion = () =>
  useSyncExternalStore(
    subscribeReduced,
    () => window.matchMedia?.(REDUCE).matches ?? false,
    () => false,
  );

interface Streak {
  x: number;
  y: number;
  length: number;
  speed: number;
}

interface Cloud {
  /** 0–1 across the travel span, so a resize keeps the layout. */
  u: number;
  y: number;
  width: number;
  alpha: number;
}

interface Star {
  x: number;
  y: number;
  radius: number;
  base: number;
  rate: number;
  phase: number;
}

const SPRITE_W = 400;
const SPRITE_H = 220;
/** Puffs of one cloud as [x, y, radius] in sprite pixels; each fades out inside the sprite, so
 *  no gradient is cut by its edge into a straight line. */
const PUFFS = [
  [110, 130, 90],
  [190, 105, 100],
  [280, 125, 95],
  [160, 150, 70],
  [240, 155, 65],
  [330, 150, 60],
] as const;

/** One soft cloud, drawn once and stamped many times. */
function cloudSprite([r, g, b]: [number, number, number]): HTMLCanvasElement | null {
  const sprite = document.createElement('canvas');
  sprite.width = SPRITE_W;
  sprite.height = SPRITE_H;
  const ctx = sprite.getContext('2d');
  if (!ctx) return null;
  for (const [x, y, radius] of PUFFS) {
    const fill = ctx.createRadialGradient(x, y, 0, x, y, radius);
    fill.addColorStop(0, `rgb(${r} ${g} ${b} / 0.55)`);
    fill.addColorStop(0.55, `rgb(${r} ${g} ${b} / 0.3)`);
    fill.addColorStop(1, `rgb(${r} ${g} ${b} / 0)`);
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }
  return sprite;
}

const between = (low: number, high: number) => low + Math.random() * (high - low);

/** Starts drawing `scene` on `canvas`; returns the function that stops it. */
export function runSky(canvas: HTMLCanvasElement, scene: Scene, still: boolean): () => void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return () => {};

  const shade = cloudSprite(scene.cloud);
  // At night and in rain the sky can take a little light: the tops of the clouds catch it.
  const light = scene.budget > 0.05 ? cloudSprite([255, 255, 255]) : null;
  let width = 0;
  let height = 0;
  let streaks: Streak[] = [];
  let stars: Star[] = [];
  const clouds: Cloud[] = Array.from({ length: scene.clouds }, (_, i) => ({
    u: (i + Math.random() * 0.8) / Math.max(scene.clouds, 1),
    y: between(-0.04, 0.46),
    width: between(0.55, 1.05),
    alpha: between(0.3, 0.5) + scene.cover * 0.35,
  }));

  function populate() {
    const area = Math.min(2.5, (width * height) / BASE_AREA);
    streaks = Array.from({ length: Math.round(scene.rain * area) }, () => ({
      x: between(-0.2 * width, 1.2 * width),
      y: between(-height, height),
      length: between(14, 26),
      speed: between(650, 950),
    }));
    stars = Array.from({ length: Math.round(scene.stars * Math.min(2, area)) }, () => ({
      x: Math.random() * width,
      y: Math.random() * height * 0.62,
      radius: between(0.6, 1.4),
      base: between(0.35, 0.85),
      rate: between(0.4, 1.1),
      phase: Math.random() * Math.PI * 2,
    }));
  }

  function resize() {
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    ctx!.setTransform(ratio, 0, 0, ratio, 0, 0);
    populate();
    if (still || !frame) draw(0, last);
  }

  const rainAlpha = Math.min(0.22, scene.budget * 0.95);
  const flashPeak = scene.budget;
  let flashAt = still ? Infinity : performance.now() + flashGap();

  function draw(dt: number, now: number) {
    const c = ctx!;
    c.clearRect(0, 0, width, height);

    for (const star of stars) {
      const twinkle = still ? 1 : 0.65 + 0.35 * Math.sin((now / 1000) * star.rate + star.phase);
      c.globalAlpha = star.base * twinkle;
      c.fillStyle = '#fff';
      c.beginPath();
      c.arc(star.x, star.y, star.radius, 0, Math.PI * 2);
      c.fill();
    }

    const span = width * 1.1;
    for (const cloud of clouds) {
      cloud.u = (((cloud.u + (scene.drift * dt) / (width + span)) % 1) + 1) % 1;
      const w = cloud.width * width;
      const x = cloud.u * (width + span) - span;
      const y = cloud.y * height;
      if (shade) {
        c.globalAlpha = Math.min(1, cloud.alpha);
        c.drawImage(shade, x, y, w, (w * SPRITE_H) / SPRITE_W);
      }
      if (light) {
        c.globalAlpha = Math.min(scene.budget * 0.6, 0.12);
        c.drawImage(light, x, y - w * 0.04, w, (w * SPRITE_H) / SPRITE_W);
      }
    }

    if (streaks.length) {
      c.globalAlpha = rainAlpha;
      c.strokeStyle = '#fff';
      c.lineWidth = 1.2;
      c.lineCap = 'round';
      c.beginPath();
      for (const streak of streaks) {
        streak.y += streak.speed * dt;
        streak.x += streak.speed * scene.slant * dt;
        if (streak.y > height) {
          streak.y = -streak.length - Math.random() * 40;
          streak.x = between(-0.2 * width, 1.2 * width);
        }
        c.moveTo(streak.x, streak.y);
        c.lineTo(streak.x + streak.length * scene.slant, streak.y + streak.length);
      }
      c.stroke();
    }

    // Lightning: a soft brightening that rises in 90 ms and fades in about 600 ms, once in 6–14 s.
    if (scene.storm && now >= flashAt) {
      const age = now - flashAt;
      const level = age < 90 ? age / 90 : Math.exp(-(age - 90) / 200);
      if (level < 0.02 && age > 90) flashAt = now + flashGap();
      else {
        c.globalAlpha = flashPeak * level;
        c.fillStyle = '#fff';
        c.fillRect(0, 0, width, height);
      }
    }
    c.globalAlpha = 1;
  }

  let frame = 0;
  let last = performance.now();
  function tick(now: number) {
    frame = requestAnimationFrame(tick);
    if (now - last < FRAME_MS) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    draw(dt, now);
  }

  resize();
  window.addEventListener('resize', resize);
  if (!still) frame = requestAnimationFrame(tick);
  return () => {
    cancelAnimationFrame(frame);
    window.removeEventListener('resize', resize);
  };
}
