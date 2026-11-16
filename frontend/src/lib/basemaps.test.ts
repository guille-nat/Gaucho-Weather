import { describe, expect, it } from 'vitest';
import { mapMaxZoom, satelliteConfig, satelliteStyle } from './basemaps';

describe('satelliteStyle', () => {
  const style = satelliteStyle(satelliteConfig({}));

  it('keeps the imagery as the bottom layer', () => {
    expect(style.layers[0]).toMatchObject({ id: 'satellite', type: 'raster' });
  });

  it('draws locality names on top of the imagery', () => {
    const places = style.layers.find((layer) => layer.id === 'labels-place');
    expect(places).toMatchObject({ type: 'symbol', source: 'labels', 'source-layer': 'place' });
    expect(style.sources.labels).toMatchObject({ type: 'vector' });
    expect(style.glyphs).toMatch(/\{fontstack\}.*\{range\}/);
  });

  it('credits OpenStreetMap for the names', () => {
    expect(JSON.stringify(style.sources.labels)).toContain('OpenStreetMap');
  });
});

describe('mapMaxZoom', () => {
  it('stops one level past the imagery so the satellite never blurs into mush', () => {
    expect(mapMaxZoom('satellite', satelliteConfig({}))).toBe(16);
    expect(
      mapMaxZoom(
        'satellite',
        satelliteConfig({
          VITE_SATELLITE_TILES_URL: 'https://x/{z}/{x}/{y}',
          VITE_SATELLITE_MAX_ZOOM: '19',
        }),
      ),
    ).toBe(19);
  });

  it('keeps the street map at its own limit', () => {
    expect(mapMaxZoom('street', satelliteConfig({}))).toBe(18);
  });
});
