import type { MembershipStatus } from '../../api/backoffice';
import type { PlanCode } from '../../api/types';
import { TIME_ZONE } from '../../lib/format';

/** Names for plan codes in rows that carry only the code (the log's payload). */
export const PLAN_NAMES: Record<PlanCode, string> = {
  basico: 'Básico',
  productor: 'Productor',
  empresa: 'Empresa',
};

export const planName = (code: unknown) =>
  typeof code === 'string' && code in PLAN_NAMES ? PLAN_NAMES[code as PlanCode] : String(code);

export const MEMBERSHIP_WORDS: Record<MembershipStatus, string> = {
  founder: 'Founder',
  trial: 'En prueba',
  active: 'Activa',
};

const day = new Intl.DateTimeFormat('es-AR', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: TIME_ZONE,
});

const moment = new Intl.DateTimeFormat('es-AR', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
  timeZone: TIME_ZONE,
});

/** `19 de noviembre de 2026`, in Buenos Aires time. */
export const formatDay = (iso: string) => day.format(new Date(iso));

/** `19 nov 2026, 09:30`, for the log. */
export const formatMoment = (iso: string) => moment.format(new Date(iso));

const count = new Intl.NumberFormat('es-AR');
export const formatCount = (value: number) => count.format(value);

/** "1 cuenta", "3 cuentas". */
export const plural = (n: number, one: string, many: string) =>
  `${formatCount(n)} ${n === 1 ? one : many}`;
