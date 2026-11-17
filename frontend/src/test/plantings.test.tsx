import { screen, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import type { Lote } from '../api/types';
import { createMockDb } from '../mocks/handlers';
import { demoLotes, demoUser } from '../mocks/fixtures';
import { renderApp } from './renderApp';
import { server } from './server';

// MapLibre needs WebGL, which jsdom does not have.
vi.mock('../components/MapPicker', () => ({ default: () => <div data-testid="map-picker" /> }));

type User = ReturnType<typeof renderApp>['user'];

/** The JSON bodies sent to a path with a write method; the mock still answers them. */
function captureBodies(path: string) {
  const bodies: unknown[] = [];
  server.use(
    http.all(`*${path}`, async ({ request }) => {
      if (request.method !== 'GET') bodies.push(await request.clone().json());
    }),
  );
  return bodies;
}

const row = (n: number) => screen.getByRole('group', { name: `Cultivo ${n}` });

async function fillRow(user: User, n: number, crop: string, ha = '', date = '') {
  const group = row(n);
  await user.selectOptions(within(group).getByRole('combobox', { name: /Cultivo/ }), crop);
  if (ha) await user.type(within(group).getByLabelText('Hectáreas sembradas'), ha);
  if (date) await user.type(within(group).getByLabelText('Fecha de siembra'), date);
}

async function fillNewLote(user: User) {
  await user.type(await screen.findByLabelText(/Nombre del lote/), 'Lote 3');
  await user.type(screen.getByLabelText('Latitud'), '-33,4592');
  await user.type(screen.getByLabelText('Longitud'), '-61,4831');
}

const withLote = (id: number, change: Partial<Lote>) =>
  demoLotes().map((l) => (l.id === id ? { ...l, ...change } : l));

describe('Cultivos en el formulario del lote (S1)', () => {
  it('creates a lote with several crops, each with its hectares and sowing date', async () => {
    const db = createMockDb({ user: demoUser });
    const { user } = renderApp('/lotes/nuevo', db);

    await fillNewLote(user);
    await user.click(screen.getByRole('button', { name: 'Agregar cultivo' }));
    await fillRow(user, 1, 'soja', '60,5', '2026-10-20');
    await user.click(screen.getByRole('button', { name: 'Agregar cultivo' }));
    await fillRow(user, 2, 'maiz', '40');
    await user.click(screen.getByRole('button', { name: 'Guardar lote' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Lote 3' })).toBeInTheDocument();
    expect(db.lotes[0]?.plantings).toMatchObject([
      { crop: 'soja', area_ha: '60.50', sowing_date: '2026-10-20' },
      { crop: 'maiz', area_ha: '40.00', sowing_date: null },
    ]);
  });

  it('accepts the same crop twice, for two sowings', async () => {
    const db = createMockDb({ user: demoUser });
    const { user } = renderApp('/lotes/nuevo', db);

    await fillNewLote(user);
    await user.click(screen.getByRole('button', { name: 'Agregar cultivo' }));
    await fillRow(user, 1, 'soja', '', '2026-10-01');
    await user.click(screen.getByRole('button', { name: 'Agregar cultivo' }));
    await fillRow(user, 2, 'soja', '', '2026-11-15');
    await user.click(screen.getByRole('button', { name: 'Guardar lote' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Lote 3' })).toBeInTheDocument();
    expect(db.lotes[0]?.plantings).toMatchObject([
      { crop: 'soja', sowing_date: '2026-10-01' },
      { crop: 'soja', sowing_date: '2026-11-15' },
    ]);
  });

  it('saves a lote with no crops as an empty list', async () => {
    const db = createMockDb({ user: demoUser });
    const { user } = renderApp('/lotes/nuevo', db);

    await fillNewLote(user);
    await user.click(screen.getByRole('button', { name: 'Guardar lote' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Lote 3' })).toBeInTheDocument();
    expect(db.lotes[0]?.plantings).toEqual([]);
  });

  it('asks for the crop of a row before saving', async () => {
    const db = createMockDb({ user: demoUser });
    const { user } = renderApp('/lotes/nuevo', db);

    await fillNewLote(user);
    await user.click(screen.getByRole('button', { name: 'Agregar cultivo' }));
    await user.click(screen.getByRole('button', { name: 'Guardar lote' }));

    expect(await within(row(1)).findByText('Elegí el cultivo.')).toBeInTheDocument();
    expect(within(row(1)).getByRole('combobox', { name: /Cultivo/ })).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    expect(db.unsafeRequests).toHaveLength(0);
  });

  it('allows at most 8 crops', async () => {
    const { user } = renderApp('/lotes/nuevo', createMockDb({ user: demoUser }));

    const add = await screen.findByRole('button', { name: 'Agregar cultivo' });
    for (let i = 0; i < 8; i++) await user.click(add);

    expect(screen.getByRole('group', { name: 'Cultivo 8' })).toBeInTheDocument();
    expect(add).toBeDisabled();
    expect(screen.getByText('Hasta 8 cultivos por lote.')).toBeInTheDocument();
  });

  it('warns when the crops add up to more than the lote, and still saves', async () => {
    const db = createMockDb({ user: demoUser });
    const { user } = renderApp('/lotes/nuevo', db);

    await fillNewLote(user);
    await user.type(screen.getByLabelText('Hectáreas'), '120');
    await user.click(screen.getByRole('button', { name: 'Agregar cultivo' }));
    await fillRow(user, 1, 'soja', '100');
    await user.click(screen.getByRole('button', { name: 'Agregar cultivo' }));
    await fillRow(user, 2, 'maiz', '30');

    expect(
      screen.getByText('Los cultivos suman 130 ha y el lote tiene 120 ha. Revisá las hectáreas.'),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Guardar lote' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Lote 3' })).toBeInTheDocument();
    expect(db.lotes[0]?.plantings).toHaveLength(2);
  });

  it('prefills the crops when editing, and removes a row', async () => {
    const db = createMockDb({ user: demoUser, lotes: demoLotes() });
    const { user } = renderApp('/lotes/4/editar', db);

    const first = await screen.findByRole('group', { name: 'Cultivo 1' });
    expect(within(first).getByRole('combobox', { name: /Cultivo/ })).toHaveValue('soja');
    expect(within(first).getByLabelText('Hectáreas sembradas')).toHaveValue('70');
    expect(within(row(2)).getByRole('combobox', { name: /Cultivo/ })).toHaveValue('maiz');

    await user.click(within(first).getByRole('button', { name: 'Quitar cultivo 1' }));
    expect(screen.queryByRole('group', { name: 'Cultivo 2' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Guardar lote' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Lote 4' })).toBeInTheDocument();
    expect(db.lotes.find((l) => l.id === 4)?.plantings).toMatchObject([
      { crop: 'maiz', area_ha: '50.00', sowing_date: null },
    ]);
  });
});

describe('Cambiar cultivos desde el lote (S2)', () => {
  it('opens the crops in a dialog and saves only them with PATCH', async () => {
    const db = createMockDb({ user: demoUser, lotes: demoLotes() });
    const { user } = renderApp('/lotes/4', db);
    const bodies = captureBodies('/api/lotes/4/');

    await user.click(await screen.findByRole('button', { name: 'Cambiar cultivos' }));
    const dialog = screen.getByRole('dialog', { name: 'Cultivos de Lote 4' });
    expect(dialog).toHaveAttribute('open');
    await user.click(within(dialog).getByRole('button', { name: 'Agregar cultivo' }));
    await fillRow(user, 3, 'girasol', '15');
    await user.click(within(dialog).getByRole('button', { name: 'Guardar cultivos' }));

    expect(await screen.findByText('Cultivos guardados.')).toBeInTheDocument();
    expect(dialog).not.toHaveAttribute('open');
    expect(db.unsafeRequests).toEqual([
      { method: 'PATCH', path: '/api/lotes/4/', csrf: db.csrfToken },
    ]);
    expect(bodies).toEqual([
      {
        plantings: [
          { crop: 'soja', area_ha: '70.00', sowing_date: '2026-10-20' },
          { crop: 'maiz', area_ha: '50.00', sowing_date: null },
          { crop: 'girasol', area_ha: '15.00', sowing_date: null },
        ],
      },
    ]);
    const crops = screen.getByRole('list', { name: 'Cultivos del lote' });
    expect(within(crops).getByText('Girasol')).toBeInTheDocument();
  });

  it('keeps the dialog open with the error when the save is refused', async () => {
    const db = createMockDb({ user: demoUser, lotes: demoLotes() });
    const { user } = renderApp('/lotes/4', db);
    server.use(
      http.patch('*/api/lotes/4/', () =>
        HttpResponse.json({ plantings: ['Hasta 8 cultivos por lote.'] }, { status: 400 }),
      ),
    );

    await user.click(await screen.findByRole('button', { name: 'Cambiar cultivos' }));
    const dialog = screen.getByRole('dialog', { name: 'Cultivos de Lote 4' });
    await user.click(within(dialog).getByRole('button', { name: 'Guardar cultivos' }));

    expect(await within(dialog).findByText('Hasta 8 cultivos por lote.')).toBeInTheDocument();
    expect(dialog).toHaveAttribute('open');
  });

  it('names the crop row the server refused', async () => {
    const db = createMockDb({ user: demoUser, lotes: demoLotes() });
    const { user } = renderApp('/lotes/4', db);
    server.use(
      http.patch('*/api/lotes/4/', () =>
        HttpResponse.json(
          { plantings: [{}, { area_ha: ['Tiene que ser mayor que 0.'] }] },
          { status: 400 },
        ),
      ),
    );

    await user.click(await screen.findByRole('button', { name: 'Cambiar cultivos' }));
    const dialog = screen.getByRole('dialog', { name: 'Cultivos de Lote 4' });
    await user.click(within(dialog).getByRole('button', { name: 'Guardar cultivos' }));

    expect(
      await within(dialog).findByText('Cultivo 2: Tiene que ser mayor que 0.'),
    ).toBeInTheDocument();
    expect(within(dialog).queryByText(/object Object/)).toBeNull();
  });

  it('checks the rows in the dialog before sending anything', async () => {
    const db = createMockDb({ user: demoUser, lotes: demoLotes() });
    const { user } = renderApp('/lotes/4', db);

    await user.click(await screen.findByRole('button', { name: 'Cambiar cultivos' }));
    const dialog = screen.getByRole('dialog', { name: 'Cultivos de Lote 4' });
    await user.click(within(dialog).getByRole('button', { name: 'Agregar cultivo' }));
    await user.click(within(dialog).getByRole('button', { name: 'Guardar cultivos' }));

    expect(await within(row(3)).findByText('Elegí el cultivo.')).toBeInTheDocument();
    expect(dialog).toHaveAttribute('open');
    expect(db.unsafeRequests).toHaveLength(0);
  });
});

describe('Datos del lote (S3)', () => {
  it('groups the facts: crops, the field and the place', async () => {
    renderApp('/lotes/4', createMockDb({ user: demoUser, lotes: demoLotes() }));

    const field = await screen.findByRole('region', { name: 'Campo' });
    expect(within(field).getByText('Superficie')).toBeInTheDocument();
    expect(within(field).getByText('120 ha')).toBeInTheDocument();
    expect(within(field).getByText('Ubicación')).toBeInTheDocument();
    expect(within(field).getByText('−33,4592, −61,4831')).toBeInTheDocument();

    const place = screen.getByRole('region', { name: 'Lugar' });
    expect(within(place).getByText('Establecimiento')).toBeInTheDocument();
    expect(within(place).getByText('La Esperanza')).toBeInTheDocument();
    expect(within(place).getByText('Localidad')).toBeInTheDocument();
    expect(within(place).getByText('Firmat')).toBeInTheDocument();

    const crops = screen.getByRole('region', { name: 'Cultivos' });
    expect(within(crops).getByRole('button', { name: 'Cambiar cultivos' })).toBeInTheDocument();
  });

  it('shows each crop as a chip with its label, hectares and sowing date', async () => {
    renderApp('/lotes/4', createMockDb({ user: demoUser, lotes: demoLotes() }));

    const crops = await screen.findByRole('list', { name: 'Cultivos del lote' });
    const items = within(crops).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('Soja');
    expect(items[0]).toHaveTextContent('70 ha · siembra 20 de octubre de 2026');
    expect(items[1]).toHaveTextContent('Maíz');
    expect(items[1]).toHaveTextContent('50 ha');
  });

  it('says when the lote has no crops, next to the way to add them', async () => {
    renderApp('/lotes/7', createMockDb({ user: demoUser, lotes: withLote(7, { plantings: [] }) }));

    const crops = await screen.findByRole('region', { name: 'Cultivos' });
    expect(within(crops).getByText('Sin cultivos cargados')).toBeInTheDocument();
    expect(within(crops).getByRole('button', { name: 'Cambiar cultivos' })).toBeInTheDocument();
  });
});

describe('Tarjeta del lote', () => {
  it('lists every crop on the meta line, and nothing when there are none', async () => {
    renderApp('/lotes', createMockDb({ user: demoUser, lotes: withLote(7, { plantings: [] }) }));

    const list = await screen.findByRole('list', { name: 'Lotes' });
    const [, lote4, lote7] = within(list).getAllByRole('listitem');
    expect(within(lote4!).getByText('Firmat · Soja · Maíz · 120 ha')).toBeInTheDocument();
    expect(within(lote7!).getByText('Chañar Ladeado · 60 ha')).toBeInTheDocument();
  });
});
