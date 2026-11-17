import { useSyncExternalStore } from 'react';

/**
 * The currency the plan prices are shown in (precios-productor S5): pesos or dollars, both
 * fixed prices set in the admin, not a conversion. Remembered on this device, pesos by default.
 */
export type Currency = 'ars' | 'usd';

const KEY = 'gw-currency-v1';
const DEFAULT: Currency = 'ars';
const listeners = new Set<() => void>();
/** Used when storage is blocked (private mode): the choice holds for this visit only. */
let memory: Currency | null = null;

function read(): Currency {
  try {
    const raw = localStorage.getItem(KEY);
    // A missing or broken entry means pesos, not an error.
    return raw === 'ars' || raw === 'usd' ? raw : DEFAULT;
  } catch {
    // Storage blocked: fall back to this visit's choice.
    return memory ?? DEFAULT;
  }
}

export function setCurrency(next: Currency) {
  memory = next;
  try {
    localStorage.setItem(KEY, next);
  } catch {
    // Kept in memory for this visit only.
  }
  listeners.forEach((notify) => notify());
}

function subscribe(notify: () => void) {
  listeners.add(notify);
  const onStorage = (event: StorageEvent) => event.key === KEY && notify();
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(notify);
    window.removeEventListener('storage', onStorage);
  };
}

export function useCurrency(): Currency {
  return useSyncExternalStore(subscribe, read, () => DEFAULT);
}
