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

export const formatTemp = (celsius: number) => `${minus(oneDecimal.format(celsius))} °C`;

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
