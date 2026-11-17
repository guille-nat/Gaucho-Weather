import type { HistoryDay, HistoryHour, Level, LoteHistory } from '../api/types';

/**
 * Mock of `GET /api/lotes/{id}/historico/` (cuenta-planes-alertas S9, S10), after
 * backend/apps/archiver/history.py. Used by the tests and by `pnpm dev:mock`; it is not the backend.
 */

export const HISTORY_SOURCE = 'open-meteo/historical-forecast';
export const HISTORY_ATTRIBUTION =
  'Datos de modelo de Open-Meteo (CC BY 4.0), no medidos en el lote.';

const FIRST_DAY = '2021-01-01';
const MAX_DAYS = 31;
const DAY_MS = 86_400_000;

/** Today in Argentina (no daylight saving: always UTC−3), as YYYY-MM-DD. */
export const localToday = (now = Date.now()) =>
  new Date(now - 3 * 3_600_000).toISOString().slice(0, 10);

const toTime = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
const addDays = (iso: string, days: number) =>
  new Date(toTime(iso) + days * DAY_MS).toISOString().slice(0, 10);
const isIsoDate = (text: string) => /^\d{4}-\d{2}-\d{2}$/.test(text) && !Number.isNaN(toTime(text));

/** Like history.parse_range: the range, or the Spanish message of a 400. */
export function checkHistoryRange(
  desde: string | null,
  hasta: string | null,
  today: string,
): { from: string; to: string } | { error: string } {
  if ((hasta && !isIsoDate(hasta)) || (desde && !isIsoDate(desde))) {
    return { error: 'Usá fechas con el formato AAAA-MM-DD.' };
  }
  const to = hasta || today;
  const from = desde || addDays(to, -6);
  if (to > today) return { error: 'La fecha «hasta» no puede ser posterior a hoy.' };
  if (from > to) return { error: 'La fecha «desde» tiene que ser anterior a «hasta».' };
  if (from < FIRST_DAY) return { error: 'El historial empieza el 1 de enero de 2021.' };
  if ((toTime(to) - toTime(from)) / DAY_MS + 1 > MAX_DAYS) {
    return { error: `Elegí hasta ${MAX_DAYS} días.` };
  }
  return { from, to };
}

const round = (value: number) => Math.round(value * 10) / 10;

/** A rough stand-in for engine.rate_wind: the mock only needs every level to show up. */
function rateWind(wind: number, gust: number): [Level, string[]] {
  const findings: [number, string][] = [];
  if (wind < 5) findings.push([1, 'poco viento']);
  else if (wind > 25) findings.push([2, 'mucho viento']);
  else if (wind > 18) findings.push([1, 'mucho viento']);
  if (gust > 35) findings.push([1, 'ráfagas fuertes']);
  findings.sort((a, b) => b[0] - a[0]);
  const level = (['ok', 'caution', 'critical'] as const)[findings[0]?.[0] ?? 0] ?? 'ok';
  return [level, findings.map(([, cause]) => cause)];
}

function demoHour(date: string, hour: number): HistoryHour {
  const seed = Math.round((toTime(date) - toTime(FIRST_DAY)) / DAY_MS);
  const warmth = Math.sin(((hour - 9) / 24) * 2 * Math.PI);
  const breeze = Math.max(0, Math.sin(((hour - 6) / 24) * 2 * Math.PI));
  const wind = round(3 + 14 * breeze + ((seed * 7) % 9));
  const gust = round(wind * 1.6);
  const [level, causes] = rateWind(wind, gust);
  const temperature = round(18 + 7 * warmth + (seed % 5));
  const humidity = Math.round(70 - 20 * warmth);
  // Calm, clear nights invert: warmer at 80 m than near the ground.
  const night = hour < 7 || hour > 20;
  const above = round(temperature + (night ? 1.5 : -1.2));
  const wetBulb = round(temperature - (100 - humidity) / 6);
  return {
    time: `${date}T${String(hour).padStart(2, '0')}:00:00-03:00`,
    temperature_c: temperature,
    humidity_pct: humidity,
    rain_mm: seed % 6 === 0 && hour >= 15 && hour <= 17 ? 2.4 : 0,
    wind_kmh: wind,
    wind_dir_deg: (seed * 40 + hour * 5) % 360,
    gust_kmh: gust,
    spray_wind: level,
    spray_wind_causes: causes,
    temperature_80m_c: above,
    wet_bulb_c: wetBulb,
    cloud_cover_pct: (seed * 13 + hour * 3) % 100,
    pressure_hpa: round(1008 + (seed % 9)),
    radiation_wm2: night ? 0 : Math.round(800 * Math.max(0, warmth)),
    delta_t_c: round(temperature - wetBulb),
    inversion: above > temperature,
  };
}

const values = (hours: HistoryHour[], pick: (h: HistoryHour) => number | null) =>
  hours.map(pick).filter((v): v is number => v !== null);

function summarise(date: string, hours: HistoryHour[]): HistoryDay {
  const max = (pick: (h: HistoryHour) => number | null) => {
    const found = values(hours, pick);
    return found.length ? round(Math.max(...found)) : null;
  };
  const temps = values(hours, (h) => h.temperature_c);
  const rain = values(hours, (h) => h.rain_mm);
  const humidity = values(hours, (h) => h.humidity_pct);
  const inversions = hours.map((h) => h.inversion).filter((v): v is boolean => v !== null);
  return {
    date,
    temp_max_c: max((h) => h.temperature_c),
    temp_min_c: temps.length ? round(Math.min(...temps)) : null,
    rain_mm: rain.length ? round(rain.reduce((a, b) => a + b, 0)) : null,
    wind_max_kmh: max((h) => h.wind_kmh),
    gust_max_kmh: max((h) => h.gust_kmh),
    humidity_min_pct: humidity.length ? round(Math.min(...humidity)) : null,
    delta_t_max_c: max((h) => h.delta_t_c),
    inversion_hours: inversions.length ? inversions.filter(Boolean).length : null,
    hours: hours.length,
  };
}

/** A full, deterministic history for any valid range; hours after `now` do not exist yet. */
export function demoLoteHistory(from: string, to: string, now = Date.now()): LoteHistory {
  const days: HistoryDay[] = [];
  const hours: HistoryHour[] = [];
  for (let date = from; date <= to; date = addDays(date, 1)) {
    const ofDay: HistoryHour[] = [];
    for (let hour = 0; hour < 24; hour++) {
      const item = demoHour(date, hour);
      if (Date.parse(item.time) <= now) ofDay.push(item);
    }
    days.push(summarise(date, ofDay));
    hours.push(...ofDay);
  }
  const today = localToday(now);
  return {
    from,
    to,
    source: HISTORY_SOURCE,
    attribution: HISTORY_ATTRIBUTION,
    complete: hours.length > 0 && days.every((d) => d.date >= today || d.hours >= 24),
    days,
    hours,
  };
}
