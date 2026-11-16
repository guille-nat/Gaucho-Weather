import type { Lote, Plan, PlanCode, User } from '../api/types';

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
      crop: 'trigo',
      sowing_date: '2026-06-14',
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
      crop: 'soja',
      sowing_date: '2026-10-20',
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
      crop: 'maiz',
      sowing_date: null,
      area_ha: 60,
      boundary: null,
      summary: null,
      created_at: '2026-11-03T08:00:00Z',
      updated_at: '2026-11-03T08:00:00Z',
    },
  ];
}
