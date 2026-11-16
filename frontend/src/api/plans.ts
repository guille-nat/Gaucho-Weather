import { apiFetch } from './client';
import type { PlansInfo } from './types';

/** Public price table (odd/tasks/cuenta-planes-alertas.md S8). */
export const getPlans = () => apiFetch<PlansInfo>('/api/planes/');
