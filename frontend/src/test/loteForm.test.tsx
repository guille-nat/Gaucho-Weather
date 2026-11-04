import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createMockDb } from '../mocks/handlers';
import { demoLotes, demoUser } from '../mocks/fixtures';
import { readPersisted } from './localData';
import { renderApp } from './renderApp';

// MapLibre needs WebGL, which jsdom does not have; the coordinate inputs cover the same value.
vi.mock('../components/MapPicker', () => ({
  default: () => <div data-testid="map-picker" />,
}));

describe('Agregar lote', () => {
  it('requires a name', async () => {
    const db = createMockDb({ user: demoUser });
    const { user } = renderApp('/lotes/nuevo', db);

    await user.click(await screen.findByRole('button', { name: 'Guardar lote' }));

    expect(await screen.findByText('Poné un nombre al lote.')).toBeInTheDocument();
    expect(screen.getByLabelText(/Nombre del lote/)).toHaveAttribute('aria-invalid', 'true');
    expect(db.unsafeRequests).toHaveLength(0);
  });

  it('requires a location', async () => {
    const db = createMockDb({ user: demoUser });
    const { user } = renderApp('/lotes/nuevo', db);

    await user.type(await screen.findByLabelText(/Nombre del lote/), 'Lote 3');
    await user.click(screen.getByRole('button', { name: 'Guardar lote' }));

    expect(
      await screen.findByText('Marcá el lote en el mapa o usá tu ubicación.'),
    ).toBeInTheDocument();
    expect(db.unsafeRequests).toHaveLength(0);
  });

  it('rejects a location outside Argentina', async () => {
    const db = createMockDb({ user: demoUser });
    const { user } = renderApp('/lotes/nuevo', db);

    await user.type(await screen.findByLabelText(/Nombre del lote/), 'Lote 3');
    await user.type(screen.getByLabelText('Latitud'), '40.4');
    await user.type(screen.getByLabelText('Longitud'), '-3.7');
    await user.click(screen.getByRole('button', { name: 'Guardar lote' }));

    expect(
      await screen.findByText('Esa ubicación queda fuera de la Argentina.'),
    ).toBeInTheDocument();
    expect(db.unsafeRequests).toHaveLength(0);
  });

  it('creates the lote with the CSRF header and opens its page', async () => {
    const db = createMockDb({ user: demoUser });
    const { user } = renderApp('/lotes/nuevo', db);

    await user.type(await screen.findByLabelText(/Nombre del lote/), 'Lote 3');
    await user.type(screen.getByLabelText('Establecimiento'), 'La Tranquera');
    await user.type(screen.getByLabelText('Localidad'), 'Firmat');
    await user.type(screen.getByLabelText('Latitud'), '-33,4592');
    await user.type(screen.getByLabelText('Longitud'), '-61.4831');
    await user.selectOptions(screen.getByLabelText('Cultivo'), 'soja');
    await user.type(screen.getByLabelText('Hectáreas'), '120,5');
    await user.click(screen.getByRole('button', { name: 'Guardar lote' }));

    expect(await screen.findByRole('heading', { name: 'Lote 3' })).toBeInTheDocument();
    expect(db.unsafeRequests).toEqual([
      { method: 'POST', path: '/api/lotes/', csrf: db.csrfToken },
    ]);
    expect(db.lotes[0]).toMatchObject({
      name: 'Lote 3',
      establishment: 'La Tranquera',
      locality: 'Firmat',
      latitude: -33.4592,
      longitude: -61.4831,
      crop: 'soja',
      area_ha: 120.5,
      sowing_date: null,
    });
  });
});

describe('Editar lote', () => {
  it('prefills the form and saves the changes with PATCH', async () => {
    const db = createMockDb({ user: demoUser, lotes: demoLotes() });
    const { user } = renderApp('/lotes/4/editar', db);

    const name = await screen.findByLabelText(/Nombre del lote/);
    expect(name).toHaveValue('Lote 4');
    await user.clear(name);
    await user.type(name, 'Lote 4 norte');
    await user.click(screen.getByRole('button', { name: 'Guardar lote' }));

    expect(await screen.findByRole('heading', { name: 'Lote 4 norte' })).toBeInTheDocument();
    expect(db.unsafeRequests).toEqual([
      { method: 'PATCH', path: '/api/lotes/4/', csrf: db.csrfToken },
    ]);
  });

  it('has the new lote on disk by the time its page opens, so a reload keeps it', async () => {
    const db = createMockDb({ user: demoUser });
    const { user } = renderApp('/lotes/nuevo', db);

    await user.type(await screen.findByLabelText(/Nombre del lote/), 'Lote 3');
    await user.type(screen.getByLabelText('Establecimiento'), 'La Tranquera');
    await user.type(screen.getByLabelText('Latitud'), '-33,4592');
    await user.type(screen.getByLabelText('Longitud'), '-61,4831');
    await user.click(screen.getByRole('button', { name: 'Guardar lote' }));

    expect(await screen.findByRole('heading', { name: 'Lote 3' })).toBeInTheDocument();
    expect((await readPersisted()).text).toContain('La Tranquera');
  });
});
