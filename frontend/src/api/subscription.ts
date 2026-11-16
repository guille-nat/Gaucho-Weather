import { apiFetch } from './client';
import type { PlanRequest, PlanRequestInput, Subscription } from './types';

/** My subscription (odd/tasks/cuenta-planes-alertas.md S14). */
export const getSubscription = () => apiFetch<Subscription>('/api/auth/suscripcion/');

/** 201 with the pending request; 400 `{detail}` when it cannot be asked for. */
export const requestPlan = (input: PlanRequestInput) =>
  apiFetch<PlanRequest>('/api/auth/suscripcion/pedido/', { method: 'POST', body: input });

/** Withdraws the pending request (204). */
export const withdrawPlanRequest = () =>
  apiFetch<void>('/api/auth/suscripcion/pedido/', { method: 'DELETE' });
