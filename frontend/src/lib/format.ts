import type { Crop } from '../api/types';

/** The product works in the south of Santa Fe; show times there, whatever the device says. */
export const TIME_ZONE = 'America/Argentina/Buenos_Aires';

const time = new Intl.DateTimeFormat('es-AR', {
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
  timeZone: TIME_ZONE,
});
const dayMonth = new Intl.DateTimeFormat('es-AR', {
  day: 'numeric',
  month: 'long',
  timeZone: TIME_ZONE,
});
const shortDate = new Intl.DateTimeFormat('es-AR', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});
const oneDecimal = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 });
const area = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 });
const coord = new Intl.NumberFormat('es-AR', {
  minimumFractionDigits: 4,
  maximumFractionDigits: 4,
});

/** Typographic minus so negative temperatures read clearly at a glance. */
const minus = (text: string) => text.replace('-', '−');

export const formatTime = (value: number | string | Date) => time.format(new Date(value));

/** `3 de noviembre`: short enough to share one line with the forecast time on a phone. */
export const formatDayMonth = (value: number | Date) => dayMonth.format(value);

/** `2026-06-14` → `14 de junio de 2026` (a calendar date, no time zone shift). */
export const formatDate = (iso: string) => shortDate.format(new Date(`${iso}T12:00:00Z`));

/** Units ride a no-break space, so a value never wraps away from its unit. */
const NBSP = '\u00a0';

export const formatTemp = (celsius: number) => `${minus(oneDecimal.format(celsius))}${NBSP}°C`;

export const formatHa = (value: number) => `${area.format(value)} ha`;

export const formatCoord = (value: number) => minus(coord.format(value));

export const CROP_LABELS: Record<Crop, string> = {
  soja: 'Soja',
  maiz: 'Maíz',
  trigo: 'Trigo',
  girasol: 'Girasol',
  cebada: 'Cebada',
  sorgo: 'Sorgo',
  otro: 'Otro',
};

export const MODEL_LABELS: Record<string, string> = {
  ecmwf_ifs025: 'ECMWF',
  gfs_seamless: 'GFS',
  icon_seamless: 'ICON',
};

/** Parses what a person types on a phone: `120,5`, `120.5`, ` -33,45 `. */
export function parseDecimal(text: string): number | null {
  const cleaned = text.trim().replace(/\s/g, '').replace('−', '-').replace(',', '.');
  if (!cleaned) return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}

/** Shown wherever the forecast has no value: a dash, never a zero. */
export const DASH = '—';

const integer = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 });
const hourOnly = new Intl.DateTimeFormat('es-AR', {
  hour: 'numeric',
  hourCycle: 'h23',
  timeZone: TIME_ZONE,
});
const weekdayShort = new Intl.DateTimeFormat('es-AR', { weekday: 'short', timeZone: 'UTC' });
const weekdayLong = new Intl.DateTimeFormat('es-AR', { weekday: 'long', timeZone: 'UTC' });

const has = (value: number | null | undefined): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** `22°`: the big rounded reading of a temperature. */
export const formatDegrees = (celsius: number | null | undefined) =>
  has(celsius) ? `${minus(integer.format(celsius))}°` : DASH;

export const formatOneDecimal = (value: number | null | undefined) =>
  has(value) ? minus(oneDecimal.format(value)) : DASH;

export const formatMm = (mm: number | null | undefined) =>
  has(mm) ? `${oneDecimal.format(mm)}${NBSP}mm` : DASH;

export const formatPct = (pct: number | null | undefined) =>
  has(pct) ? `${integer.format(pct)}${NBSP}%` : DASH;

export const formatKmh = (kmh: number | null | undefined) =>
  has(kmh) ? `${integer.format(kmh)}${NBSP}km/h` : DASH;

export const formatTimeOrDash = (iso: string | null | undefined) => (iso ? formatTime(iso) : DASH);

/** `14 h`, in Argentina whatever the phone says. */
export const formatHour = (iso: string) => `${Number(hourOnly.format(new Date(iso)))}${NBSP}h`;

const capitalise = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** `Hoy`, `Mañana`, `Vie 6`: a calendar date of the forecast against today's. */
export function formatDayShort(date: string, today: string): string {
  const days = Math.round(
    (Date.parse(`${date}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86_400_000,
  );
  if (days === 0) return 'Hoy';
  if (days === 1) return 'Mañana';
  const at = new Date(`${date}T12:00:00Z`);
  return `${capitalise(weekdayShort.format(at).replace('.', ''))} ${at.getUTCDate()}`;
}

/** `viernes 6`: the spoken form of a short day label. */
export function formatDayLong(date: string, today: string): string {
  const short = formatDayShort(date, today);
  if (short === 'Hoy' || short === 'Mañana') return short;
  const at = new Date(`${date}T12:00:00Z`);
  return `${capitalise(weekdayLong.format(at))} ${at.getUTCDate()}`;
}

const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];

/** Where the wind comes from, in the 8 points the radio uses. */
export const windFrom = (degrees: number | null | undefined) =>
  has(degrees) ? COMPASS[Math.round((((degrees % 360) + 360) % 360) / 45) % 8]! : null;
