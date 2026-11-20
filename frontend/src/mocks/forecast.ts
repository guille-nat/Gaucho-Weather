import type {
  Decisions,
  Forecast,
  ForecastDay,
  ForecastHour,
  Place,
  PublicForecast,
  Sky,
  SprayHour,
} from '../api/types';

/**
 * Synthetic forecasts with the S5/S10 shape, for the tests and `pnpm dev:mock`.
 * `sol`: a clear Wednesday morning; `lluvia`: a rainy afternoon (26 mm today);
 * `noche`: the same rainy day at 23 h, like the real archive sample (nulls included).
 */
export type DemoSky = 'sol' | 'lluvia' | 'noche';

/** Wednesday 4 November 2026, Argentina (UTC−3, no DST). */
const BASE_DAY = Date.UTC(2026, 10, 4);
const HOUR = 3_600_000;

const pad = (n: number) => String(n).padStart(2, '0');

/** Epoch ms → `2026-11-04T10:00:00-03:00`. */
function isoAR(ms: number): string {
  const d = new Date(ms - 3 * HOUR);
  return (
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:00-03:00`
  );
}

const localMs = (day: number, hour: number, minute = 0) =>
  BASE_DAY + day * 24 * HOUR + (hour + 3) * HOUR + minute * 60_000;

interface Plan {
  nowHour: number;
  rain: number[];
  probability: (number | null)[];
  sky: Sky[];
  max: number[];
  min: number[];
  decisions: Decisions;
  rainPast: number | null;
  nulls?: boolean;
}

const PLANS: Record<DemoSky, Plan> = {
  sol: {
    nowHour: 10,
    rain: [0, 0, 1.3, 12.4, 3, 0, 0],
    probability: [3, 5, 60, 85, 55, 10, 2],
    sky: ['sol', 'sol', 'parcial', 'lluvia', 'lluvia', 'parcial', 'sol'],
    max: [27.4, 28.1, 25.2, 21.3, 19.8, 23.5, 26],
    min: [12.1, 13.4, 15, 14.2, 10.6, 9.4, 11.8],
    rainPast: 4.2,
    decisions: {
      frost_tonight: {
        level: 'ok',
        min_2m_c: 12.1,
        ground_estimate_c: 8.1,
        models_agreeing: '0 de 3 modelos',
        reason: 'Noche despejada: en el suelo puede bajar a 8,1 °C. Ningún modelo da helada.',
      },
      spray_today: {
        level: 'ok',
        best_window: { start: isoAR(localMs(0, 10)), end: isoAR(localMs(0, 13)) },
        reason: 'Buena ventana de 10 a 13 h.',
      },
      field_work: {
        level: 'caution',
        next_rain: { date: '2026-11-07', mm: 12.4, probability_pct: 85 },
        reason: 'Sábado se esperan 12,4 mm (85 %): no entres con la sembradora ese día.',
      },
      engine_version: 'v0',
      validated: false,
    },
  },
  lluvia: {
    nowHour: 15,
    rain: [26.1, 0.1, 0, 1.3, 1.5, 0, 0],
    probability: [100, 3, 0, 88, 67, 2, 3],
    sky: ['lluvia', 'parcial', 'sol', 'lluvia', 'lluvia', 'sol', 'sol'],
    max: [19.9, 24.9, 26.8, 23.2, 19.1, 22.1, 25.2],
    min: [16.4, 14.9, 11.5, 14.9, 11.8, 9.2, 11.1],
    rainPast: 51.9,
    decisions: {
      frost_tonight: {
        level: 'ok',
        min_2m_c: 15.9,
        ground_estimate_c: 15.4,
        models_agreeing: '0 de 3 modelos',
        reason:
          'Noche nublada o con viento: en el suelo puede bajar a 15,4 °C. Ningún modelo da helada.',
      },
      spray_today: {
        level: 'critical',
        best_window: null,
        reason: 'Hoy no conviene pulverizar: lluvia en las próximas 6 h.',
      },
      field_work: {
        level: 'critical',
        next_rain: { date: '2026-11-04', mm: 26.1, probability_pct: 100 },
        reason: 'Hoy se esperan 26,1 mm (100 %): no entres con la sembradora.',
      },
      engine_version: 'v0',
      validated: false,
    },
  },
  noche: {
    nowHour: 23,
    rain: [26.1, 0.1, 0, 1.3, 1.5, 0, 0],
    probability: [100, 3, 0, 88, 67, 2, 3],
    sky: ['lluvia', 'parcial', 'sol', 'lluvia', 'lluvia', 'sol', 'sol'],
    max: [19.9, 24.9, 26.8, 23.2, 19.1, 22.1, 25.2],
    min: [16.4, 14.9, 11.5, 14.9, 11.8, 9.2, 11.1],
    rainPast: 51.9,
    nulls: true,
    decisions: {
      frost_tonight: {
        level: 'ok',
        min_2m_c: 15.9,
        ground_estimate_c: 15.4,
        models_agreeing: '0 de 3 modelos',
        reason:
          'Noche nublada o con viento: en el suelo puede bajar a 15,4 °C. Ningún modelo da helada.',
      },
      spray_today: {
        level: 'caution',
        best_window: null,
        reason: 'Ya no quedan horas de luz para pulverizar hoy.',
      },
      field_work: {
        level: 'ok',
        next_rain: null,
        reason: 'No se esperan lluvias de 5 mm o más en los próximos 7 días.',
      },
      engine_version: 'v0',
      validated: false,
    },
  },
};

const CLOUD: Record<Sky, number> = { sol: 12, parcial: 48, nublado: 86, lluvia: 96, tormenta: 100 };

function hourly(plan: Plan): ForecastHour[] {
  return Array.from({ length: 48 }, (_, i) => {
    const at = localMs(0, plan.nowHour + i);
    const hour = (plan.nowHour + i) % 24;
    const day = Math.floor((plan.nowHour + i) / 24);
    const warm = Math.sin(((hour - 9) / 24) * 2 * Math.PI);
    const max = plan.max[day] ?? 24;
    const min = plan.min[day] ?? 12;
    const raining = plan.rain[day]! > 5 && hour >= 12 && hour <= 20;
    const daySky = plan.sky[day] ?? 'parcial';
    const sky: Sky = raining ? 'lluvia' : daySky === 'lluvia' ? 'nublado' : daySky;
    const temperature = Math.round(((max + min) / 2 + ((max - min) / 2) * warm) * 10) / 10;
    const humidity = raining ? 96 : Math.round(60 - warm * 18);
    return {
      time: isoAR(at),
      temperature_c: temperature,
      humidity_pct: humidity,
      wind_kmh: Math.round((12 + 8 * Math.sin(i / 3)) * 10) / 10,
      gust_kmh: Math.round((24 + 14 * Math.sin(i / 3)) * 10) / 10,
      rain_mm: raining ? Math.round((1 + (hour % 4) * 1.4) * 10) / 10 : 0,
      rain_probability_pct: raining
        ? 90 + (hour % 3) * 3
        : (plan.probability[day] ?? 0) > 50
          ? 35
          : 2,
      sky,
      cloud_cover_pct: CLOUD[sky],
      wind_direction_deg: plan.nulls ? null : (124 + i * 5) % 360,
      spray: plan.nulls ? null : sprayHour(hour, raining, temperature, humidity),
    };
  });
}

/**
 * A stand-in for the engine's hourly spray rating (S1 of lote-tablero): rain is critical, the
 * night hours carry a possible inversion, the hot afternoon a high Delta T, the rest is fine.
 */
function sprayHour(
  hour: number,
  raining: boolean,
  temperature: number,
  humidity: number,
): SprayHour {
  const delta_t_c = Math.round(((100 - humidity) / 100) * (temperature / 3) * 10) / 10;
  if (raining) {
    return {
      level: 'critical',
      causes: ['lluvia en las próximas 6 h'],
      delta_t_c,
      inversion: false,
    };
  }
  if (hour < 7 || hour >= 20) {
    return { level: 'caution', causes: ['posible inversión térmica'], delta_t_c, inversion: true };
  }
  if (hour >= 13 && hour <= 17) {
    return { level: 'caution', causes: ['Delta T alto'], delta_t_c, inversion: false };
  }
  return { level: 'ok', causes: [], delta_t_c, inversion: false };
}

function daily(plan: Plan): ForecastDay[] {
  return plan.rain.map((rain, i) => ({
    date: isoAR(localMs(i, 12)).slice(0, 10),
    max_c: plan.max[i] ?? null,
    min_c: plan.min[i] ?? null,
    rain_mm: rain,
    rain_probability_pct: plan.probability[i] ?? null,
    sky: plan.sky[i] ?? 'parcial',
  }));
}

export function demoForecast(variant: DemoSky = 'sol'): Forecast {
  const plan = PLANS[variant];
  const hours = hourly(plan);
  const now = hours[0]!;
  return {
    fetched_at: isoAR(localMs(0, plan.nowHour) - 50 * 60_000),
    models: ['ecmwf_ifs025', 'gfs_seamless', 'icon_seamless'],
    now: {
      time: now.time,
      temperature_c: now.temperature_c,
      humidity_pct: now.humidity_pct,
      wind_kmh: now.wind_kmh,
      wind_dir_deg: plan.nulls ? null : 124,
      gust_kmh: plan.nulls ? null : now.gust_kmh,
      sky: now.sky,
      cloud_cover_pct: plan.nulls ? null : now.cloud_cover_pct,
      rain_mm: now.rain_mm,
    },
    today: {
      max_c: plan.max[0] ?? null,
      min_c: plan.min[0] ?? null,
      sunrise: plan.nulls ? null : isoAR(localMs(0, 6, 4)),
      sunset: plan.nulls ? null : isoAR(localMs(0, 19, 33)),
    },
    rain_past_7d_mm: plan.rainPast,
    daily: daily(plan),
    hourly: hours,
    decisions: structuredClone(plan.decisions),
  };
}

export function demoPublicForecast(
  variant: DemoSky = 'sol',
  place: PublicForecast['place'] = { name: 'Rosario', region: 'Santa Fe' },
): PublicForecast {
  return { ...demoForecast(variant), place };
}

/** What `/api/lugares/` knows in the mock: a few towns of the zona núcleo. */
export const demoPlaces: Place[] = [
  { name: 'Rosario', region: 'Santa Fe', lat: -32.9468, lon: -60.6393 },
  { name: 'Casilda', region: 'Santa Fe', lat: -33.0441, lon: -61.1683 },
  { name: 'Firmat', region: 'Santa Fe', lat: -33.4592, lon: -61.4831 },
  { name: 'Chañar Ladeado', region: 'Santa Fe', lat: -33.325, lon: -62.038 },
  { name: 'Cañada de Gómez', region: 'Santa Fe', lat: -32.8164, lon: -61.3949 },
  { name: 'Pergamino', region: 'Buenos Aires', lat: -33.8899, lon: -60.5736 },
  { name: 'Marcos Juárez', region: 'Córdoba', lat: -32.6977, lon: -62.1053 },
  { name: 'Venado Tuerto', region: 'Santa Fe', lat: -33.7456, lon: -61.9688 },
];
