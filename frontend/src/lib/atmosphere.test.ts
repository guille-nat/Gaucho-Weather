import { describe, expect, it } from 'vitest';
import type { Forecast, ForecastNow } from '../api/types';
import { demoForecast } from '../mocks/forecast';
import { cloudTone, contrast, flashGap, mixWhite, sceneFor, whiteBudget } from './atmosphere';
import { THEME_COLOR } from './sky';

/** A forecast whose current hour is `now`, at 10 h (day) or 23 h (night). */
function at(now: Partial<ForecastNow>, night = false): Forecast {
  const forecast = demoForecast('sol');
  const time = night ? '2026-11-04T23:00:00-03:00' : '2026-11-04T10:00:00-03:00';
  forecast.now = { ...forecast.now, time, ...now };
  return forecast;
}

const INK_2 = 0.88; // ink-2 is white mixed 88 % into the sky
const toGray = ([r, g, b]: number[]) => [r, r, r].map(() => Math.round((r! + g! + b!) / 3));

describe('the contrast budget of each sky', () => {
  it.each(Object.entries(THEME_COLOR))(
    'keeps secondary ink at AA on %s under the white the layer may add',
    (_theme, sky) => {
      const budget = whiteBudget(sky);
      expect(budget).toBeGreaterThanOrEqual(0);
      expect(contrast(mixWhite(sky, INK_2), mixWhite(sky, budget))).toBeGreaterThanOrEqual(4.5);
    },
  );

  it('leaves a bright day almost no white, and a night plenty', () => {
    expect(whiteBudget(THEME_COLOR.dia)).toBeLessThan(0.02);
    expect(whiteBudget(THEME_COLOR.noche)).toBeGreaterThan(0.2);
  });

  it('draws clouds in a veiled tone as bright as the sky, so they never lower contrast', () => {
    for (const sky of Object.values(THEME_COLOR)) {
      const ratio = contrast(sky, cloudTone(sky));
      expect(cloudTone(sky)).not.toEqual(toGray(cloudTone(sky)));
      expect(ratio).toBeLessThan(1.02);
    }
  });
});

describe('the scene of this hour', () => {
  it('rains harder with more millimetres, and not at all without rain', () => {
    const drizzle = sceneFor(at({ sky: 'lluvia', rain_mm: 0.3, cloud_cover_pct: 95 }));
    const downpour = sceneFor(at({ sky: 'lluvia', rain_mm: 8, cloud_cover_pct: 100 }));
    const dry = sceneFor(at({ sky: 'nublado', rain_mm: 0, cloud_cover_pct: 90 }));
    expect(drizzle.rain).toBeGreaterThan(0);
    expect(downpour.rain).toBeGreaterThan(drizzle.rain * 2);
    expect(dry.rain).toBe(0);
  });

  it('drifts the clouds where the wind blows, faster with more wind', () => {
    const fromEast = sceneFor(
      at({ sky: 'parcial', cloud_cover_pct: 50, wind_kmh: 20, wind_dir_deg: 90 }),
    );
    const fromWest = sceneFor(
      at({ sky: 'parcial', cloud_cover_pct: 50, wind_kmh: 20, wind_dir_deg: 270 }),
    );
    const gale = sceneFor(
      at({ sky: 'parcial', cloud_cover_pct: 50, wind_kmh: 60, wind_dir_deg: 270 }),
    );
    expect(fromEast.drift).toBeLessThan(0);
    expect(fromWest.drift).toBeGreaterThan(0);
    expect(gale.drift).toBeGreaterThan(fromWest.drift);
    expect(fromWest.slant).toBeGreaterThan(0);
  });

  it('shows more clouds under more cover, and none on a clear sky', () => {
    const clear = sceneFor(at({ sky: 'sol', cloud_cover_pct: 5 }));
    const half = sceneFor(at({ sky: 'parcial', cloud_cover_pct: 50 }));
    const overcast = sceneFor(at({ sky: 'nublado', cloud_cover_pct: 95 }));
    expect(clear.clouds).toBe(0);
    expect(half.clouds).toBeGreaterThan(0);
    expect(overcast.clouds).toBeGreaterThan(half.clouds);
  });

  it('lights stars only on a clear night, fewer under cloud', () => {
    expect(sceneFor(at({ sky: 'sol', cloud_cover_pct: 0 })).stars).toBe(0);
    const clear = sceneFor(at({ sky: 'sol', cloud_cover_pct: 0 }, true));
    const hazy = sceneFor(at({ sky: 'parcial', cloud_cover_pct: 60 }, true));
    expect(clear.stars).toBeGreaterThan(hazy.stars);
    expect(hazy.stars).toBeGreaterThan(0);
    expect(sceneFor(at({ sky: 'lluvia', rain_mm: 2 }, true)).stars).toBe(0);
  });

  it('flashes lightning only in a storm, never more than once a second', () => {
    expect(sceneFor(at({ sky: 'tormenta', rain_mm: 6 })).storm).toBe(true);
    expect(sceneFor(at({ sky: 'lluvia', rain_mm: 6 })).storm).toBe(false);
    expect(flashGap(() => 0)).toBeGreaterThanOrEqual(1000);
    expect(flashGap(() => 0.999)).toBeLessThan(16_000);
  });

  it('stays still on a clear calm day, so nothing moves without weather', () => {
    const scene = sceneFor(at({ sky: 'sol', cloud_cover_pct: 3, rain_mm: 0, wind_kmh: 4 }));
    expect(scene.moving).toBe(false);
  });

  it('reads a cached forecast without the hour sky from the day', () => {
    const forecast = demoForecast('sol');
    delete forecast.now.sky;
    delete forecast.now.cloud_cover_pct;
    delete forecast.now.rain_mm;
    const scene = sceneFor(forecast);
    expect(scene.rain).toBe(0);
    expect(scene.theme).toBe('dia');
  });
});
