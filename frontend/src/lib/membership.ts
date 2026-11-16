import type { User } from '../api/types';

const DAY_MS = 86_400_000;

/** Whole days left, rounded up: "12 días" until the last minute of the 12th day. */
export function daysLeft(expiresAt: string, now = Date.now()): number {
  return Math.max(Math.ceil((Date.parse(expiresAt) - now) / DAY_MS), 0);
}

/** How the account holds its plan: founder for good, or a trial with days left. */
export function membership(me: User): string | null {
  if (me.founder_number != null) return `Founder n.º ${me.founder_number} · gratis para siempre`;
  if (me.plan_expires_at) {
    const days = daysLeft(me.plan_expires_at);
    return `Prueba: te quedan ${days} ${days === 1 ? 'día' : 'días'}`;
  }
  return null;
}
