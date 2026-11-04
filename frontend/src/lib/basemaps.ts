import type { StyleSpecification } from 'maplibre-gl';

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

export function satelliteStyle(config: SatelliteConfig): StyleSpecification {
  return {
    version: 8,
    sources: {
      satellite: {
        type: 'raster',
        tiles: [config.url],
        tileSize: 256,
        maxzoom: config.maxzoom,
        attribution: config.attribution,
      },
    },
    layers: [{ id: 'satellite', type: 'raster', source: 'satellite' }],
  };
}
