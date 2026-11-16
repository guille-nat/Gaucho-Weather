import { act, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { MapPickerProps } from '../components/MapPicker';
import { formatHa } from '../lib/format';
import { areaHa, centroid, roundHa, type LngLat } from '../lib/outline';
import { createMockDb } from '../mocks/handlers';
import { account, demoLotes, demoUser, planOf } from '../mocks/fixtures';
import { readPersisted } from './localData';
import { renderApp } from './renderApp';

// MapLibre needs WebGL, which jsdom does not have. The stand-in keeps the latest props so a
// test can tap the map, drag a corner, or read where the map was asked to fly.
const map = vi.hoisted(() => ({ props: null as MapPickerProps | null }));
vi.mock('../components/MapPicker', () => ({
  default: (props: MapPickerProps) => {
    map.props = props;
    return <div data-testid="map-picker" />;
  },
}));

const mapProps = () => {
  if (!map.props) throw new Error('The map did not render.');
  return map.props;
};
const tap = ([lon, lat]: LngLat) => act(() => mapProps().onTap({ lat, lon }));

// About 1 km × 1 km near Firmat.
const dLat = (1000 / 6378137) * (180 / Math.PI);
const dLon = dLat / Math.cos((-33.46 * Math.PI) / 180);
const SQUARE: [LngLat, LngLat, LngLat, LngLat] = [
  [-61.48, -33.46],
  [-61.48 + dLon, -33.46],
  [-61.48 + dLon, -33.46 + dLat],
  [-61.48, -33.46 + dLat],
];

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

  it('explains the plan limit with a way to the plans, and keeps the session', async () => {
    const basico = account({ id: 5, email: 'b@x.com', name: 'B', plan: planOf('basico') });
    const db = createMockDb({ user: basico, lotes: demoLotes().slice(0, 2) });
    const { user } = renderApp('/lotes/nuevo', db);

    await user.type(await screen.findByLabelText(/Nombre del lote/), 'Lote 3');
    await user.type(screen.getByLabelText('Latitud'), '-33,4592');
    await user.type(screen.getByLabelText('Longitud'), '-61.4831');
    await user.click(screen.getByRole('button', { name: 'Guardar lote' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(
      'Tu plan Básico permite hasta 2 lotes. Mirá los planes para sumar más.',
    );
    expect(within(alert).getByRole('link', { name: 'Ver planes' })).toHaveAttribute(
      'href',
      '/planes',
    );
    expect(screen.getByRole('button', { name: 'Guardar lote' })).toBeInTheDocument();
    expect(db.lotes).toHaveLength(2);
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

describe('Mapa del lote (S7)', () => {
  it('draws the outline corner by corner, shows the hectares live and saves them', async () => {
    const db = createMockDb({ user: demoUser });
    const { user } = renderApp('/lotes/nuevo', db);

    await user.type(await screen.findByLabelText(/Nombre del lote/), 'Lote 3');
    expect(screen.getByRole('button', { name: 'Dibujar contorno' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    for (const corner of SQUARE) await tap(corner);
    const expected = roundHa(areaHa(SQUARE));
    expect(screen.getByText(formatHa(expected))).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Cerrar contorno' }));
    expect(mapProps().outline.closed).toBe(true);
    expect(screen.getByLabelText('Hectáreas')).toHaveValue(String(expected).replace('.', ','));
    await user.click(screen.getByRole('button', { name: 'Guardar lote' }));

    expect(await screen.findByRole('heading', { name: 'Lote 3' })).toBeInTheDocument();
    const saved = db.lotes[0]!;
    const [lon, lat] = centroid(SQUARE)!;
    expect(saved.area_ha).toBe(expected);
    expect(Math.abs(expected - 100)).toBeLessThan(1);
    expect(saved.latitude).toBeCloseTo(lat, 6);
    expect(saved.longitude).toBeCloseTo(lon, 6);
    expect(saved.boundary?.type).toBe('Polygon');
    const ring = saved.boundary!.coordinates[0]!;
    expect(ring).toHaveLength(5);
    expect(ring[0]).toEqual(ring[4]);
    // The lote's page shows the saved area.
    expect(screen.getAllByText(formatHa(expected)).length).toBeGreaterThan(0);
  });

  it('keeps a placed pin as the location and still saves the outline', async () => {
    const db = createMockDb({ user: demoUser });
    const { user } = renderApp('/lotes/nuevo', db);

    await user.type(await screen.findByLabelText(/Nombre del lote/), 'Lote 3');
    await user.click(screen.getByRole('button', { name: 'Marcar punto' }));
    await act(() => mapProps().onTap({ lat: -33.455, lon: -61.475 }));
    await user.click(screen.getByRole('button', { name: 'Dibujar contorno' }));
    for (const corner of SQUARE.slice(0, 3)) await tap(corner);
    // Tapping the first corner again closes the outline.
    await act(() => mapProps().onVertexTap(0));
    await user.click(screen.getByRole('button', { name: 'Guardar lote' }));

    expect(await screen.findByRole('heading', { name: 'Lote 3' })).toBeInTheDocument();
    expect(db.lotes[0]).toMatchObject({ latitude: -33.455, longitude: -61.475 });
    expect(db.lotes[0]?.boundary?.coordinates[0]).toHaveLength(4);
  });

  it('undoes the last corner and clears the outline', async () => {
    renderApp('/lotes/nuevo', createMockDb({ user: demoUser }));
    const undo = await screen.findByRole('button', { name: 'Deshacer' });
    for (const corner of SQUARE.slice(0, 2)) await tap(corner);
    expect(mapProps().outline.points).toHaveLength(2);

    await act(() => undo.click());
    expect(mapProps().outline.points).toEqual([SQUARE[0]]);
    await act(() => screen.getByRole('button', { name: 'Borrar contorno' }).click());
    expect(mapProps().outline.points).toEqual([]);
  });

  it('moves and removes corners of a closed outline', async () => {
    const { user } = renderApp('/lotes/nuevo', createMockDb({ user: demoUser }));
    await screen.findByRole('button', { name: 'Deshacer' });
    for (const corner of SQUARE) await tap(corner);
    await user.click(screen.getByRole('button', { name: 'Cerrar contorno' }));

    await act(() => mapProps().onVertexMove(1, { lat: -33.47, lon: -61.47 }));
    expect(mapProps().outline.points[1]).toEqual([-61.47, -33.47]);
    await act(() => mapProps().onMidpoint(1, { lat: -33.465, lon: -61.475 }));
    expect(mapProps().outline.points).toHaveLength(5);

    await act(() => mapProps().onVertexTap(2));
    expect(mapProps().selected).toBe(2);
    await user.click(screen.getByRole('button', { name: 'Quitar esquina' }));
    expect(mapProps().outline.points).toHaveLength(4);
  });

  it('does not save an outline that was left open', async () => {
    const db = createMockDb({ user: demoUser });
    const { user } = renderApp('/lotes/nuevo', db);

    await user.type(await screen.findByLabelText(/Nombre del lote/), 'Lote 3');
    for (const corner of SQUARE.slice(0, 3)) await tap(corner);
    await user.click(screen.getByRole('button', { name: 'Guardar lote' }));

    expect(
      await screen.findByText('Cerrá el contorno: tocá la primera esquina o «Cerrar contorno».'),
    ).toBeInTheDocument();
    expect(db.unsafeRequests).toHaveLength(0);
  });

  it('finds a town and flies the map there', async () => {
    const { user } = renderApp('/lotes/nuevo', createMockDb({ user: demoUser }));

    await user.type(await screen.findByLabelText('Buscar localidad o paraje'), 'Firmat');
    const results = await screen.findByRole('list', { name: 'Lugares encontrados' });
    await user.click(within(results).getByRole('button', { name: /Firmat/ }));

    expect(mapProps().focus).toMatchObject({ lat: -33.4592, lon: -61.4831 });
    expect(screen.queryByRole('list', { name: 'Lugares encontrados' })).not.toBeInTheDocument();
  });

  it('does not submit the lote when Enter is pressed in the place search', async () => {
    const db = createMockDb({ user: demoUser });
    const { user } = renderApp('/lotes/nuevo', db);

    await user.type(await screen.findByLabelText(/Nombre del lote/), 'Lote 3');
    await user.type(screen.getByLabelText('Buscar localidad o paraje'), 'Firmat{Enter}');

    expect(screen.queryByText('Marcá el lote en el mapa o usá tu ubicación.')).toBeNull();
    expect(db.unsafeRequests).toHaveLength(0);
  });

  it('starts on the satellite and switches to the street map', async () => {
    const { user } = renderApp('/lotes/nuevo', createMockDb({ user: demoUser }));

    await screen.findByTestId('map-picker');
    expect(mapProps().basemap).toBe('satellite');
    await user.click(screen.getByRole('button', { name: 'Calles' }));
    expect(mapProps().basemap).toBe('street');
    expect(screen.getByRole('button', { name: 'Calles' })).toHaveAttribute('aria-pressed', 'true');
  });
});

describe('Editar lote', () => {
  it('loads the saved outline into the map', async () => {
    const [first, ...rest] = demoLotes();
    const lote = {
      ...first!,
      boundary: { type: 'Polygon' as const, coordinates: [[...SQUARE, SQUARE[0]]] },
    };
    renderApp(`/lotes/${lote.id}/editar`, createMockDb({ user: demoUser, lotes: [lote, ...rest] }));

    await screen.findByLabelText(/Nombre del lote/);
    expect(mapProps().outline).toEqual({ points: SQUARE, closed: true });
  });

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
