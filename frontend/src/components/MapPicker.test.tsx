/// <reference types="node" />
import { render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { EMPTY_OUTLINE } from '../lib/outline';
import MapPicker, { type MapPickerProps } from './MapPicker';

// jsdom has no WebGL: a stand-in records how MapLibre is set up.
const maplibre = vi.hoisted(() => ({
  workerUrl: null as string | null,
  options: [] as Record<string, unknown>[],
}));

vi.mock('maplibre-gl', () => {
  class Evented {
    on() {
      return this;
    }
  }
  class FakeMap extends Evented {
    doubleClickZoom = { enable() {}, disable() {} };
    constructor(options: Record<string, unknown>) {
      super();
      maplibre.options.push(options);
    }
    addControl() {}
    fitBounds() {}
    remove() {}
    getSource() {
      return undefined;
    }
    getCanvas() {
      return document.createElement('canvas');
    }
  }
  return {
    Map: FakeMap,
    Marker: class extends Evented {},
    NavigationControl: class {},
    setWorkerUrl: (url: string) => {
      maplibre.workerUrl = url;
    },
  };
});
vi.mock('maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url', () => ({
  default: '/assets/maplibre-gl-worker-abc123.js',
}));

const noop = () => {};
const props: MapPickerProps = {
  pin: null,
  outline: EMPTY_OUTLINE,
  selected: null,
  tool: 'outline',
  basemap: 'satellite',
  focus: null,
  onTap: noop,
  onPinMove: noop,
  onVertexTap: noop,
  onVertexMove: noop,
  onMidpoint: noop,
};

describe('MapPicker setup (the blank map bug)', () => {
  it('points MapLibre at a worker Vite builds, so tiles can load', () => {
    render(<MapPicker {...props} />);
    // Without this MapLibre 6 looks for maplibre-gl-worker.mjs next to the pre-bundled chunk,
    // which does not exist, and never draws a tile.
    expect(maplibre.workerUrl).toBe('/assets/maplibre-gl-worker-abc123.js');
  });

  it('opens on the satellite imagery with its attribution', () => {
    render(<MapPicker {...props} />);
    const style = maplibre.options.at(-1)?.style as {
      sources: { satellite: { tiles: string[]; attribution: string } };
    };
    expect(style.sources.satellite.tiles[0]).toContain('/s2cloudless_3857/');
    expect(style.sources.satellite.attribution).toContain('CC BY 4.0');
  });
});

describe('Map container CSS (the blank map bug)', () => {
  // Class selectors in a simple selector list, enough for these flat rules.
  const classes = (selector: string) => selector.match(/\.[\w-]+/g)?.length ?? 0;
  const positionRules = (css: string, className: string) =>
    [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)]
      .filter(([, selector, body]) => selector!.includes(className) && /position\s*:/.test(body!))
      .map(([, selector]) => selector!.trim());

  it('outweighs MapLibre’s own position rule, which loads later in the lazy chunk', () => {
    // MapLibre's `.maplibregl-map { position: relative }` arrives after app.css, so a rule of
    // the same weight lost and the map collapsed to 0 px high inside its frame. jsdom does not
    // apply specificity, so this checks the weights; the real browser proof is in the docs.
    const root = process.cwd();
    const require = createRequire(resolve(root, 'package.json'));
    const maplibreCss = readFileSync(require.resolve('maplibre-gl/dist/maplibre-gl.css'), 'utf8');
    const appCss = readFileSync(resolve(root, 'src/styles/app.css'), 'utf8');

    const theirs = positionRules(maplibreCss, '.maplibregl-map').filter((s) => !s.includes(' '));
    const ours = positionRules(appCss, '.map-canvas');
    expect(theirs.length).toBeGreaterThan(0);
    expect(ours.length).toBeGreaterThan(0);
    for (const selector of ours) {
      expect(classes(selector)).toBeGreaterThan(Math.max(...theirs.map(classes)));
    }
  });
});
