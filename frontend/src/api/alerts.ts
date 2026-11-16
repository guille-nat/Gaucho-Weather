import { apiFetch } from './client';
import type {
  AlertComparator,
  AlertInbox,
  AlertRule,
  AlertRuleInput,
  AlertVariable,
  PushSubscriptionInput,
} from './types';

/** Custom alerts and their channels (odd/tasks/cuenta-planes-alertas.md S6, S7). */

export const listAlertRules = () => apiFetch<AlertRule[]>('/api/alertas/reglas/');

export const createAlertRule = (input: AlertRuleInput) =>
  apiFetch<AlertRule>('/api/alertas/reglas/', { method: 'POST', body: input });

export const updateAlertRule = (id: number, changes: Partial<AlertRuleInput>) =>
  apiFetch<AlertRule>(`/api/alertas/reglas/${id}/`, { method: 'PATCH', body: changes });

export const deleteAlertRule = (id: number) =>
  apiFetch<void>(`/api/alertas/reglas/${id}/`, { method: 'DELETE' });

export const getAlertInbox = () => apiFetch<AlertInbox>('/api/alertas/eventos/');

/** Marks these events read, or every unread one when `ids` is left out. */
export const markAlertsRead = (ids?: number[]) =>
  apiFetch<void>('/api/alertas/eventos/leer/', {
    method: 'POST',
    body: ids ? { ids } : {},
  });

/** The VAPID public key; 503 with a detail while the server has none configured. */
export const getPushKey = () =>
  apiFetch<{ public_key: string }>('/api/alertas/push/clave/').then((r) => r.public_key);

/** 402 `plan_limit` on plans without push (S4, S7). */
export const savePushSubscription = (subscription: PushSubscriptionInput) =>
  apiFetch<{ endpoint: string }>('/api/alertas/push/', { method: 'POST', body: subscription });

export const deletePushSubscription = (endpoint: string) =>
  apiFetch<void>('/api/alertas/push/', { method: 'DELETE', body: { endpoint } });

interface VariableSpec {
  label: string;
  /** Empty for the spray window: it takes no comparison and no value. */
  comparators: AlertComparator[];
  unit: string;
  /** What the form starts with when this variable is chosen. */
  suggested: number | null;
}

/** Mirrors SPECS in backend/apps/alerts/rules.py: what the server accepts per variable. */
export const ALERT_VARIABLES: Record<AlertVariable, VariableSpec> = {
  frost: { label: 'Helada en el suelo', comparators: ['lt', 'lte'], unit: '°C', suggested: 0 },
  temp_min: {
    label: 'Temperatura mínima',
    comparators: ['lt', 'lte', 'gt', 'gte'],
    unit: '°C',
    suggested: 2,
  },
  temp_max: {
    label: 'Temperatura máxima',
    comparators: ['lt', 'lte', 'gt', 'gte'],
    unit: '°C',
    suggested: 35,
  },
  rain: { label: 'Lluvia del día', comparators: ['gt', 'gte'], unit: 'mm', suggested: 20 },
  wind: { label: 'Viento', comparators: ['gt', 'gte'], unit: 'km/h', suggested: 30 },
  spray_window: { label: 'Ventana para pulverizar', comparators: [], unit: '', suggested: null },
};

export const COMPARATOR_WORDS: Record<AlertComparator, string> = {
  lt: 'menor a',
  lte: 'menor o igual a',
  gt: 'mayor a',
  gte: 'mayor o igual a',
};

/** 2.5 → "2,5"; 35 → "35", like rules.number. */
const number = (value: number) => String(value).replace('.', ',');

/** The rule in words, exactly as the backend's rules.describe writes it. */
export function describeRule(
  variable: AlertVariable,
  comparator: AlertComparator | null,
  threshold: number | null,
  loteName: string,
): string {
  let text: string;
  if (variable === 'spray_window') {
    text = 'Ventana para pulverizar';
  } else if (variable === 'frost') {
    const t = number(threshold ?? 0);
    text =
      comparator === 'lte'
        ? `Helada en el suelo de ${t} °C o menos`
        : `Helada en el suelo por debajo de ${t} °C`;
  } else {
    const cmp = COMPARATOR_WORDS[comparator ?? 'lt'];
    const t = number(threshold ?? 0);
    text = {
      temp_min: `Mínima ${cmp} ${t} °C`,
      temp_max: `Máxima ${cmp} ${t} °C`,
      rain: `Lluvia ${cmp} ${t} mm en el día`,
      wind: `Viento ${cmp} ${t} km/h`,
    }[variable];
  }
  return `${text} en ${loteName}`;
}
