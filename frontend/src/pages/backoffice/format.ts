import type { MembershipStatus } from '../../api/backoffice';
import { SUBSCRIPTION_WORDS } from '../../api/payments';
import type { PlanChangeReason, PlanCode, ProviderSubscriptionStatus } from '../../api/types';
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

/** Why a plan changed, in the backoffice's third person (PlanChange.Reason in the backend). */
export const REASON_WORDS: Record<PlanChangeReason, string> = {
  founder: 'Alta como founder',
  trial: 'Alta con prueba de Productor',
  trial_ended: 'Fin de la prueba',
  request: 'Pedido del usuario',
  staff: 'Cambio del equipo',
  payment: 'Pago aprobado',
  payment_ended: 'Suscripción terminada',
  courtesy: 'Cortesía',
  courtesy_ended: 'Fin de la cortesía',
};

/** A subscription status from a log payload, in the words Suscripción uses. */
export const subscriptionWord = (status: unknown) =>
  typeof status === 'string' && status in SUBSCRIPTION_WORDS
    ? SUBSCRIPTION_WORDS[status as ProviderSubscriptionStatus]
    : String(status);

const isoDay = new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE });

/** Tomorrow in Buenos Aires as `YYYY-MM-DD`: the first day a trial can be given until. */
export const tomorrowInBuenosAires = (now = Date.now()) => isoDay.format(now + 86_400_000);

/** A year from today in Buenos Aires: the last day a cortesía can be given until (cortesias S1). */
export const lastCourtesyDay = (now = Date.now()) => tomorrowInBuenosAires(now + 364 * 86_400_000);
