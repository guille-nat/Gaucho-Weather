import { apiFetch } from './client';
import type { MyPayments, PaymentStatus, PlanCode, ProviderSubscriptionStatus } from './types';

/** Payments with Mercado Pago, in pesos (pagos-backoffice S3). */
export const getMyPayments = () => apiFetch<MyPayments>('/api/pagos/');

/**
 * 201 with the Mercado Pago checkout. Refusals answer `{detail}` in Spanish (400, 409, 502, 503)
 * and are shown as they are.
 */
export const subscribe = (plan: PlanCode) =>
  apiFetch<{ checkout_url: string }>('/api/pagos/suscribirme/', {
    method: 'POST',
    body: { plan, currency: 'ARS' },
  });

/** Cancels at Mercado Pago; the paid month is kept. Answers like `GET /api/pagos/`. */
export const cancelSubscription = () =>
  apiFetch<MyPayments>('/api/pagos/cancelar/', { method: 'POST' });

/** Leaves the app for the provider's checkout page, which comes back to `?pago=`. */
export function goToCheckout(url: string) {
  window.location.assign(url);
}

/** How the subscription's state reads on Suscripción and in the backoffice. */
export const SUBSCRIPTION_WORDS: Record<ProviderSubscriptionStatus, string> = {
  pending: 'Esperando el pago',
  authorized: 'Activa',
  paused: 'Pausada',
  cancelled: 'Cancelada',
};

export const PAYMENT_WORDS: Record<PaymentStatus, string> = {
  approved: 'Aprobado',
  pending: 'Pendiente',
  rejected: 'Rechazado',
  refunded: 'Devuelto',
  cancelled: 'Cancelado',
};

// Argentine grouping, like the price cards: "$ 14.900".
const amount = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 });

/** "$ 14.900" for pesos, "US$ 10" for dollars, the code otherwise. */
export function formatMoney(value: number, currency = 'ARS'): string {
  const symbol = currency === 'ARS' ? '$' : currency === 'USD' ? 'US$' : currency;
  return `${symbol} ${amount.format(value)}`;
}

/** Shown to a founder on the Empresa card (promociones SF5), from `founder_empresa_price_ars`. */
export const founderDifferenceNote = (price: number) =>
  `Como founder pagás solo la diferencia: $${amount.format(price)} por mes.`;
