import { apiFetch } from './client';
import type { Lote, LoteInput } from './types';

export const listLotes = () => apiFetch<Lote[]>('/api/lotes/');
export const getLote = (id: number) => apiFetch<Lote>(`/api/lotes/${id}/`);
export const createLote = (input: LoteInput) =>
  apiFetch<Lote>('/api/lotes/', { method: 'POST', body: input });
export const updateLote = (id: number, input: Partial<LoteInput>) =>
  apiFetch<Lote>(`/api/lotes/${id}/`, { method: 'PATCH', body: input });
export const deleteLote = (id: number) => apiFetch<void>(`/api/lotes/${id}/`, { method: 'DELETE' });
