import { apiFetch, apiGetServed } from './client';
import type { Lote, LoteInput, LotesSnapshot } from './types';

export async function listLotes(): Promise<LotesSnapshot> {
  const { data, servedAt, fromCache } = await apiGetServed<Lote[]>('/api/lotes/');
  return { items: data, servedAt, fromCache };
}

export const getLote = (id: number) => apiFetch<Lote>(`/api/lotes/${id}/`);
export const createLote = (input: LoteInput) =>
  apiFetch<Lote>('/api/lotes/', { method: 'POST', body: input });
export const updateLote = (id: number, input: Partial<LoteInput>) =>
  apiFetch<Lote>(`/api/lotes/${id}/`, { method: 'PATCH', body: input });
export const deleteLote = (id: number) => apiFetch<void>(`/api/lotes/${id}/`, { method: 'DELETE' });
