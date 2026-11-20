import type { Decisions, Forecast, Level } from '../api/types';

export type DecisionKey = 'frost_tonight' | 'field_work' | 'spray_today';

export const SEVERITY: Record<Level, number> = { ok: 0, caution: 1, critical: 2 };

/** The level in words, beside its icon: never by colour alone. */
export const LEVEL_LABEL: Record<Level, string> = {
  ok: 'Bien',
  caution: 'Ojo',
  critical: 'Alerta',
};

export const DECISION_TITLE: Record<DecisionKey, string> = {
  frost_tonight: 'Helada esta noche',
  spray_today: 'Pulverizar hoy',
  field_work: 'Labores y siembra',
};

/** S3: every verdict of engine v0 says so on screen. */
export const HONEST_LINE = 'Estimación con reglas publicadas; todavía sin validar en tu zona';

export interface Verdict {
  key: DecisionKey;
  level: Level;
  reason: string;
}

/** Spraying only means something while there is light left today (as the backend headline). */
function daylightLeft(forecast: Forecast): boolean {
  const { sunset } = forecast.today;
  if (sunset) return Date.parse(forecast.now.time) < Date.parse(sunset);
  return forecast.decisions.spray_today.best_window !== null;
}

/**
 * The one verdict for the "Para el campo" pill, with the backend headline's rule: the worst level
 * wins, ties go frost, field work, spray; when all is fine, a spray window is the most useful line.
 */
export function fieldVerdict(forecast: Forecast): Verdict {
  const d: Decisions = forecast.decisions;
  const options: Verdict[] = [
    { key: 'frost_tonight', level: d.frost_tonight.level, reason: d.frost_tonight.reason },
    { key: 'field_work', level: d.field_work.level, reason: d.field_work.reason },
  ];
  const spray: Verdict = {
    key: 'spray_today',
    level: d.spray_today.level,
    reason: d.spray_today.reason,
  };
  const light = daylightLeft(forecast);
  if (light) options.push(spray);
  const top = Math.max(...options.map((o) => SEVERITY[o.level]));
  if (top === 0 && light && d.spray_today.best_window) return spray;
  return options.find((o) => SEVERITY[o.level] === top)!;
}

/** Keeps a number with its unit on one line: "12,4 mm", "85 %", "−0,6 °C", "13 h". */
export const keepUnits = (text: string) => text.replace(/(\d) (mm|%|°C|h\b|km\/h)/g, '$1\u00a0$2');

/** The lote board's plain order (lote-tablero S2): what ties keep. */
const BOARD_ORDER: DecisionKey[] = ['frost_tonight', 'spray_today', 'field_work'];

/** The lote's decisions, most urgent first; ties keep frost, spraying, field work (S2). */
export function byUrgency(decisions: Decisions): DecisionKey[] {
  // `sort` is stable, so equal levels stay in the plain order.
  return [...BOARD_ORDER].sort(
    (a, b) => SEVERITY[decisions[b].level] - SEVERITY[decisions[a].level],
  );
}

/** The hours of the spray window: from its start, up to (not including) its end hour. */
export function windowHours(forecast: Forecast): Forecast['hourly'] {
  const window = forecast.decisions.spray_today.best_window;
  if (!window) return [];
  const start = Date.parse(window.start);
  const end = Date.parse(window.end);
  return forecast.hourly.filter((h) => {
    const at = Date.parse(h.time);
    return at >= start && at < end;
  });
}

/** True when the hour is inside the spray window. */
export function inWindow(forecast: Forecast, time: string): boolean {
  const window = forecast.decisions.spray_today.best_window;
  if (!window) return false;
  const at = Date.parse(time);
  return at >= Date.parse(window.start) && at < Date.parse(window.end);
}

/** `12–17`, or `12` when both ends round the same; null without data. */
export function rangeText(values: (number | null | undefined)[]): string | null {
  const known = values.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  if (!known.length) return null;
  const low = Math.round(Math.min(...known));
  const high = Math.round(Math.max(...known));
  return low === high ? `${low}` : `${low}–${high}`;
}
