import { apiFetch } from './client';
import type { LoteHistory } from './types';

/** Past weather of a lote between two local dates, YYYY-MM-DD (cuenta-planes-alertas S9, S10). */
export const getLoteHistory = (id: number, desde: string, hasta: string) =>
  apiFetch<LoteHistory>(
    `/api/lotes/${id}/historico/?${new URLSearchParams({ desde, hasta }).toString()}`,
  );
