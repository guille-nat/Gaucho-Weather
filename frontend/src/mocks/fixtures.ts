import type { AlertEvent, Lote, Plan, PlanCode, User } from '../api/types';

/** The three plans as migration 0003 seeds them (prices still unset). */
export const demoPlans: Plan[] = [
  {
    code: 'basico',
    name: 'Básico',
    price_ars_month: null,
    max_lotes: 2,
    max_alert_rules: 3,
    allows_push: false,
    priority_support: false,
    highlighted: false,
  },
  {
    code: 'productor',
    name: 'Productor',
    price_ars_month: null,
    max_lotes: 15,
    max_alert_rules: null,
    allows_push: true,
    priority_support: false,
    highlighted: true,
  },
  {
    code: 'empresa',
    name: 'Empresa',
    price_ars_month: null,
    max_lotes: null,
    max_alert_rules: null,
    allows_push: true,
    priority_support: true,
    highlighted: false,
  },
];

export const planOf = (code: PlanCode): Plan => {
  const plan = demoPlans.find((p) => p.code === code);
  if (!plan) throw new Error(`Unknown plan ${code}`);
  return plan;
};

/** An account as /api/auth/me/ serialises it; defaults to Productor with no expiry. */
export function account(fields: Pick<User, 'id' | 'email' | 'name'> & Partial<User>): User {
  return {
    plan: planOf('productor'),
    plan_expires_at: null,
    founder_number: null,
    usage: { lotes: 0 },
    notify_push: true,
    notify_email: true,
    ...fields,
  };
}

export const demoUser: User = account({
  id: 1,
  email: 'ana@lacampana.com.ar',
  name: 'Ana Ferreyra',
  founder_number: 7,
});

const fetchedAt = '2026-11-03T09:10:00Z';

/** Three synthetic lotes in the south of Santa Fe, as the backend would serialise them. */
export function demoLotes(): Lote[] {
  return [
    {
      id: 12,
      name: 'Lote 12',
      establishment: 'El Ombú',
      locality: 'Casilda',
      latitude: -33.0441,
      longitude: -61.1683,
      plantings: [{ id: 1, crop: 'trigo', area_ha: null, sowing_date: '2026-06-14' }],
      area_ha: 85,
      boundary: null,
      summary: {
        tonight_min_c_2m: 6.4,
        tonight_min_models: { ecmwf_ifs025: 6.1, gfs_seamless: 7.0, icon_seamless: 6.2 },
        fetched_at: fetchedAt,
        headline: { level: 'ok', text: 'Ventana para pulverizar de 10 a 13 h.' },
      },
      created_at: '2026-10-01T12:00:00Z',
      updated_at: '2026-10-01T12:00:00Z',
    },
    {
      id: 4,
      name: 'Lote 4',
      establishment: 'La Esperanza',
      locality: 'Firmat',
      latitude: -33.4592,
      longitude: -61.4831,
      // Split in two: the plantings add up to the whole lote.
      plantings: [
        { id: 2, crop: 'soja', area_ha: '70.00', sowing_date: '2026-10-20' },
        { id: 3, crop: 'maiz', area_ha: '50.00', sowing_date: null },
      ],
      area_ha: 120,
      boundary: {
        type: 'Polygon',
        coordinates: [
          [
            [-61.4901, -33.4521],
            [-61.4712, -33.4548],
            [-61.4735, -33.4669],
            [-61.4889, -33.4641],
            [-61.4901, -33.4521],
          ],
        ],
      },
      summary: {
        tonight_min_c_2m: 3,
        tonight_min_models: { ecmwf_ifs025: 2.6, gfs_seamless: 3.8, icon_seamless: 3.1 },
        fetched_at: fetchedAt,
        headline: {
          level: 'caution',
          text: 'Ojo con la helada: en el suelo puede bajar a −0,6 °C.',
        },
      },
      created_at: '2026-10-01T12:00:00Z',
      updated_at: '2026-10-01T12:00:00Z',
    },
    {
      id: 7,
      name: 'Lote 7',
      establishment: 'San Cayetano',
      locality: 'Chañar Ladeado',
      latitude: -33.325,
      longitude: -62.038,
      plantings: [{ id: 4, crop: 'maiz', area_ha: null, sowing_date: null }],
      area_ha: 60,
      boundary: null,
      summary: null,
      created_at: '2026-11-03T08:00:00Z',
      updated_at: '2026-11-03T08:00:00Z',
    },
  ];
}

/** Two unread alerts and an older read one, newest first, as the inbox lists them (S7). */
export function demoAlertEvents(): AlertEvent[] {
  return [
    {
      id: 3,
      title: 'Mínima de 1,5 °C mañana en Lote 4',
      body: 'Tu regla: Mínima menor a 2 °C en Lote 4. Se esperan 1,5 °C mañana a las 06:00.',
      target_date: '2026-11-17',
      created_at: '2026-11-16T21:05:00Z',
      read_at: null,
      lote: 4,
      lote_name: 'Lote 4',
    },
    {
      id: 2,
      title: 'Ventana para pulverizar hoy en Lote 12',
      body: 'Tu regla: Ventana para pulverizar en Lote 12. De 10 a 13 h el viento acompaña.',
      target_date: '2026-11-16',
      created_at: '2026-11-16T09:10:00Z',
      read_at: null,
      lote: 12,
      lote_name: 'Lote 12',
    },
    {
      id: 1,
      title: 'Lluvia de 25 mm mañana en Lote 7',
      body: 'Tu regla: Lluvia mayor a 20 mm en el día en Lote 7. Se esperan 25 mm mañana.',
      target_date: '2026-11-15',
      created_at: '2026-11-14T21:00:00Z',
      read_at: '2026-11-15T07:00:00Z',
      lote: 7,
      lote_name: 'Lote 7',
    },
  ];
}
