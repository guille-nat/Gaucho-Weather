import type { ExpressionSpecification, StyleSpecification } from 'maplibre-gl';

export type Basemap = 'satellite' | 'street';

/** OpenFreeMap "liberty": OpenStreetMap vector tiles, no API key, commercial use allowed. */
export const STREET_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';

/**
 * Default satellite imagery: EOxCloudless 2016 (Sentinel-2), CC BY 4.0, no key. It is the
 * only EOX year that is both open for commercial use and global: 2017 is CC BY but covers
 * Europe only (blank over Argentina), and 2018 onwards is CC BY-NC-SA.
 * Licence per layer: https://tiles.maps.eox.at/wmts/1.0.0/WMTSCapabilities.xml
 */
const EOX_2016 = {
  url: 'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless_3857/default/g/{z}/{y}/{x}.jpg',
  attribution:
    '<a href="https://cloudless.eox.at" target="_blank" rel="noopener">EOxCloudless 2016</a> by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2016), <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener">CC BY 4.0</a>',
  // Sentinel-2 is 10 m per pixel: past z15 the tiles only get blurrier.
  maxzoom: 15,
};

interface SatelliteConfig {
  url: string;
  attribution: string;
  maxzoom: number;
}

/**
 * A sharper provider can replace the default at build time, e.g. Esri World Imagery or
 * MapTiler with a key: VITE_SATELLITE_TILES_URL (XYZ template), VITE_SATELLITE_ATTRIBUTION
 * and VITE_SATELLITE_MAX_ZOOM. See Doc/funcionalidades/frontend-pwa.md.
 */
export function satelliteConfig(env: Record<string, string | undefined>): SatelliteConfig {
  const url = env.VITE_SATELLITE_TILES_URL?.trim();
  if (!url) return EOX_2016;
  const maxzoom = Number(env.VITE_SATELLITE_MAX_ZOOM);
  return {
    url,
    attribution: env.VITE_SATELLITE_ATTRIBUTION?.trim() || 'Imágenes satelitales',
    maxzoom: Number.isFinite(maxzoom) && maxzoom > 0 ? maxzoom : 19,
  };
}

/** The street map's own limit; the satellite stops one level past its imagery instead. */
const STREET_MAX_ZOOM = 18;

/**
 * How far the map may zoom in. Past its source's maxzoom a raster is only stretched, so the
 * satellite stops one level beyond it: enough to place a corner, not enough to blur into mush.
 */
export function mapMaxZoom(basemap: Basemap, config: SatelliteConfig): number {
  return basemap === 'satellite'
    ? Math.min(STREET_MAX_ZOOM + 1, config.maxzoom + 1)
    : STREET_MAX_ZOOM;
}

/** Place and road names over the imagery: OpenFreeMap vector tiles (OpenStreetMap, ODbL). */
const LABELS_ATTRIBUTION =
  '<a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> <a href="https://www.openmaptiles.org/" target="_blank" rel="noopener">&copy; OpenMapTiles</a> Data from <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>';

const NAME: ExpressionSpecification = ['coalesce', ['get', 'name:es'], ['get', 'name']];
const HALO = {
  'text-color': '#ffffff',
  'text-halo-color': 'rgba(4, 16, 42, 0.85)',
  'text-halo-width': 1.6,
  'text-halo-blur': 0.4,
} as const;

export function satelliteStyle(config: SatelliteConfig): StyleSpecification {
  return {
    version: 8,
    glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
    sources: {
      satellite: {
        type: 'raster',
        tiles: [config.url],
        tileSize: 256,
        maxzoom: config.maxzoom,
        attribution: config.attribution,
      },
      labels: {
        type: 'vector',
        url: 'https://tiles.openfreemap.org/planet',
        attribution: LABELS_ATTRIBUTION,
      },
    },
    layers: [
      { id: 'satellite', type: 'raster', source: 'satellite' },
      {
        // Route numbers and road names: how a farmer tells which camino leads to the lote.
        id: 'labels-road',
        type: 'symbol',
        source: 'labels',
        'source-layer': 'transportation_name',
        minzoom: 11,
        layout: {
          'symbol-placement': 'line',
          'text-field': ['coalesce', ['get', 'ref'], NAME],
          'text-font': ['Noto Sans Regular'],
          'text-size': 12,
          'text-max-angle': 30,
        },
        paint: HALO,
      },
      {
        id: 'labels-place',
        type: 'symbol',
        source: 'labels',
        'source-layer': 'place',
        filter: [
          'match',
          ['get', 'class'],
          ['city', 'town', 'village', 'hamlet', 'locality'],
          true,
          false,
        ],
        layout: {
          'text-field': NAME,
          'text-font': ['Noto Sans Bold'],
          'text-size': ['match', ['get', 'class'], 'city', 18, 'town', 16, 'village', 14, 13],
          'text-max-width': 8,
          'symbol-sort-key': ['match', ['get', 'class'], 'city', 0, 'town', 1, 'village', 2, 3],
        },
        paint: HALO,
      },
    ],
  };
}
