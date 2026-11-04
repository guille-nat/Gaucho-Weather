import 'maplibre-gl/dist/maplibre-gl.css';
import {
  Map as MapLibreMap,
  Marker,
  NavigationControl,
  setWorkerUrl,
  type GeoJSONSource,
  type LngLatBoundsLike,
  type MapMouseEvent,
  type StyleSpecification,
} from 'maplibre-gl';
// MapLibre 6 finds its worker next to its own module URL. Vite pre-bundles that module into
// `.vite/deps` (dev) and a hashed chunk (build), where no worker file sits, so the map never
// draws a tile. Vite builds the worker itself here, as a `.js` file nginx serves as JavaScript.
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { useEffect, useRef } from 'react';
import { STREET_STYLE_URL, satelliteConfig, satelliteStyle, type Basemap } from '../lib/basemaps';
import type { LngLat, Outline } from '../lib/outline';

setWorkerUrl(workerUrl);

/** South of Santa Fe, the initial zone of the product. */
const DEFAULT_CENTER: [number, number] = [-61.6, -33.3];
const GOLD = '#f2b705';
const NIGHT = '#04102a';

export interface LatLon {
  lat: number;
  lon: number;
}

/** Where to fly; a new `key` flies again to the same place. */
export interface MapFocus extends LatLon {
  key: number;
}

export type MapTool = 'outline' | 'pin';

export interface MapPickerProps {
  pin: LatLon | null;
  outline: Outline;
  /** Index of the corner picked for removal, if any. */
  selected: number | null;
  tool: MapTool;
  basemap: Basemap;
  focus: MapFocus | null;
  onTap: (point: LatLon) => void;
  onPinMove: (point: LatLon) => void;
  onVertexTap: (index: number) => void;
  onVertexMove: (index: number, point: LatLon) => void;
  /** Adds a corner at `index`, between the two corners around that edge. */
  onMidpoint: (index: number, point: LatLon) => void;
  /** The map centre after each move, for the "add a corner under the crosshair" button. */
  onCenter?: (point: LatLon) => void;
}

const styleFor = (basemap: Basemap): StyleSpecification | string =>
  basemap === 'satellite' ? satelliteStyle(satelliteConfig(import.meta.env)) : STREET_STYLE_URL;

const reducedMotion = () =>
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

const toLatLon = ({ lng, lat }: { lng: number; lat: number }): LatLon => ({ lat, lon: lng });

function stakeElement() {
  // A survey stake ("mojón"): ink pin with the brand gold head.
  const el = document.createElement('div');
  el.className = 'map-stake';
  el.innerHTML =
    '<svg width="34" height="44" viewBox="0 0 34 44" aria-hidden="true"><path d="M17 43S3 27.5 3 16a14 14 0 0 1 28 0c0 11.5-14 27-14 27Z" fill="#141414"/><circle cx="17" cy="16" r="6" fill="#f2b705" stroke="#fff" stroke-width="2"/></svg>';
  return el;
}

/** A 44 px touch target around a small visible handle (PRODUCT.md: one thumb, gloves on). */
function handleElement(className: string) {
  const el = document.createElement('div');
  el.className = className;
  el.innerHTML = '<span aria-hidden="true"></span>';
  return el;
}

interface OutlineFeature {
  type: 'Feature';
  properties: { kind: 'area' | 'edge' | 'draft'; closed?: boolean };
  geometry:
    { type: 'Polygon'; coordinates: LngLat[][] } | { type: 'LineString'; coordinates: LngLat[] };
}

/** What `GeoJSONSource.setData` takes, without a direct dependency on @types/geojson. */
type GeoJsonData = Parameters<GeoJSONSource['setData']>[0];

function outlineData({ points, closed }: Outline): GeoJsonData {
  const features: OutlineFeature[] = [];
  const first = points[0];
  if (first && points.length >= 3) {
    features.push({
      type: 'Feature',
      properties: { kind: 'area', closed },
      geometry: { type: 'Polygon', coordinates: [[...points, first]] },
    });
  }
  if (first && points.length >= 2) {
    features.push({
      type: 'Feature',
      properties: { kind: closed ? 'edge' : 'draft' },
      geometry: { type: 'LineString', coordinates: closed ? [...points, first] : points },
    });
  }
  return { type: 'FeatureCollection', features };
}

/** Outline layers ride on top of whichever basemap is loaded; a style swap drops them. */
function addOutlineLayers(map: MapLibreMap, outline: Outline) {
  if (!map.getSource('outline')) {
    map.addSource('outline', { type: 'geojson', data: outlineData(outline) });
    map.addLayer({
      id: 'outline-fill',
      type: 'fill',
      source: 'outline',
      filter: ['==', ['get', 'kind'], 'area'],
      paint: { 'fill-color': GOLD, 'fill-opacity': ['case', ['get', 'closed'], 0.28, 0.14] },
    });
    map.addLayer({
      id: 'outline-casing',
      type: 'line',
      source: 'outline',
      filter: ['!=', ['get', 'kind'], 'area'],
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': NIGHT, 'line-width': 6, 'line-opacity': 0.55 },
    });
    map.addLayer({
      id: 'outline-line',
      type: 'line',
      source: 'outline',
      filter: ['==', ['get', 'kind'], 'edge'],
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': GOLD, 'line-width': 3 },
    });
    // Still open: dashed, so it reads as unfinished at a glance.
    map.addLayer({
      id: 'outline-draft',
      type: 'line',
      source: 'outline',
      filter: ['==', ['get', 'kind'], 'draft'],
      paint: { 'line-color': GOLD, 'line-width': 3, 'line-dasharray': [2, 1.5] },
    });
  } else {
    (map.getSource('outline') as GeoJSONSource).setData(outlineData(outline));
  }
}

function boundsOf(points: LngLat[]): LngLatBoundsLike {
  const lons = points.map((p) => p[0]);
  const lats = points.map((p) => p[1]);
  return [
    [Math.min(...lons), Math.min(...lats)],
    [Math.max(...lons), Math.max(...lats)],
  ];
}

const isHandle = (event: MapMouseEvent) =>
  event.originalEvent.target instanceof Element &&
  event.originalEvent.target.closest('.map-vertex, .map-mid, .map-stake') !== null;

export default function MapPicker(props: MapPickerProps) {
  const { pin, outline, selected, tool, basemap, focus } = props;
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  const stake = useRef<Marker | null>(null);
  const vertices = useRef<Marker[]>([]);
  const midpoints = useRef<Marker[]>([]);
  const latest = useRef(props);
  const initial = useRef(props);
  const shownBasemap = useRef(basemap);

  useEffect(() => {
    latest.current = props;
  });

  useEffect(() => {
    if (!container.current) return;
    const start = initial.current;
    const instance = new MapLibreMap({
      container: container.current,
      style: styleFor(start.basemap),
      center: start.pin ? [start.pin.lon, start.pin.lat] : DEFAULT_CENTER,
      zoom: start.pin ? 14 : 8,
      maxZoom: 18,
      attributionControl: { compact: true },
      cooperativeGestures: false,
    });
    if (start.outline.points.length >= 2) {
      instance.fitBounds(boundsOf(start.outline.points), {
        padding: 48,
        maxZoom: 16,
        animate: false,
      });
    }
    instance.addControl(new NavigationControl({ showCompass: false }), 'top-right');
    instance.on('style.load', () => addOutlineLayers(instance, latest.current.outline));
    instance.on('click', (event: MapMouseEvent) => {
      if (isHandle(event)) return;
      latest.current.onTap(toLatLon(event.lngLat));
    });
    const reportCenter = () => latest.current.onCenter?.(toLatLon(instance.getCenter()));
    instance.on('load', () => {
      reportCenter();
      // Credits stay one tap away on the (i) button instead of covering a third of a phone map.
      container.current
        ?.querySelector('.maplibregl-ctrl-attrib')
        ?.classList.remove('maplibregl-compact-show');
    });
    instance.on('moveend', reportCenter);
    map.current = instance;
    return () => {
      instance.remove();
      map.current = null;
      stake.current = null;
      vertices.current = [];
      midpoints.current = [];
    };
  }, []);

  // Basemap toggle: swap the style; `style.load` puts the outline back on top.
  useEffect(() => {
    const instance = map.current;
    if (!instance || shownBasemap.current === basemap) return;
    shownBasemap.current = basemap;
    instance.setStyle(styleFor(basemap), { diff: false });
  }, [basemap]);

  // Drawing taps would zoom on a quick double tap; keep zoom on the buttons and pinch.
  useEffect(() => {
    const instance = map.current;
    if (!instance) return;
    if (tool === 'outline') instance.doubleClickZoom.disable();
    else instance.doubleClickZoom.enable();
    instance.getCanvas().style.cursor = tool === 'outline' ? 'crosshair' : '';
  }, [tool]);

  // The outline shape and its draggable corners.
  useEffect(() => {
    const instance = map.current;
    if (!instance) return;
    const source = instance.getSource('outline') as GeoJSONSource | undefined;
    source?.setData(outlineData(outline));

    const editing = tool === 'outline';
    const corners = editing ? outline.points : [];
    while (vertices.current.length > corners.length) vertices.current.pop()?.remove();
    corners.forEach((point, index) => {
      let marker = vertices.current[index];
      if (!marker) {
        const el = handleElement('map-vertex');
        let dragged = false;
        const created = new Marker({ element: el, draggable: true })
          .setLngLat(point)
          .addTo(instance);
        const at = () => Number(el.dataset.index);
        created.on('dragstart', () => {
          dragged = true;
        });
        created.on('drag', () => latest.current.onVertexMove(at(), toLatLon(created.getLngLat())));
        created.on('dragend', () => {
          latest.current.onVertexMove(at(), toLatLon(created.getLngLat()));
          // The click that ends a drag is not a tap on the corner.
          setTimeout(() => {
            dragged = false;
          });
        });
        el.addEventListener('click', (event) => {
          event.stopPropagation();
          if (!dragged) latest.current.onVertexTap(at());
        });
        vertices.current[index] = created;
        marker = created;
      }
      const el = marker.getElement();
      el.dataset.index = String(index);
      el.setAttribute('aria-label', `Esquina ${index + 1}`);
      el.classList.toggle('is-selected', selected === index);
      el.classList.toggle('is-closer', !outline.closed && index === 0 && corners.length >= 3);
      marker.setLngLat(point);
    });

    // Midpoint handles: tap to add a corner there, or drag it where the corner goes.
    const edges =
      editing && corners.length >= 2 ? (outline.closed ? corners.length : corners.length - 1) : 0;
    while (midpoints.current.length > edges) midpoints.current.pop()?.remove();
    for (let index = 0; index < edges; index++) {
      const a = corners[index]!;
      const b = corners[(index + 1) % corners.length]!;
      const middle: [number, number] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      let marker = midpoints.current[index];
      if (!marker) {
        const el = handleElement('map-mid');
        let dragged = false;
        const created = new Marker({ element: el, draggable: true })
          .setLngLat(middle)
          .addTo(instance);
        const at = () => Number(el.dataset.edge) + 1;
        created.on('dragstart', () => {
          dragged = true;
        });
        created.on('dragend', () => {
          latest.current.onMidpoint(at(), toLatLon(created.getLngLat()));
          setTimeout(() => {
            dragged = false;
          });
        });
        el.addEventListener('click', (event) => {
          event.stopPropagation();
          if (!dragged) latest.current.onMidpoint(at(), toLatLon(created.getLngLat()));
        });
        midpoints.current[index] = created;
        marker = created;
      }
      const el = marker.getElement();
      el.dataset.edge = String(index);
      el.setAttribute('aria-label', `Sumar esquina entre la ${index + 1} y la siguiente`);
      marker.setLngLat(middle);
    }
  }, [outline, selected, tool]);

  // The pin ("mojón").
  useEffect(() => {
    const instance = map.current;
    if (!instance) return;
    if (!pin) {
      stake.current?.remove();
      stake.current = null;
      return;
    }
    const lngLat: [number, number] = [pin.lon, pin.lat];
    if (!stake.current) {
      const created = new Marker({ element: stakeElement(), anchor: 'bottom', draggable: true })
        .setLngLat(lngLat)
        .addTo(instance);
      created.on('dragend', () => latest.current.onPinMove(toLatLon(created.getLngLat())));
      stake.current = created;
    } else {
      stake.current.setLngLat(lngLat);
    }
    if (!instance.getBounds().contains(lngLat)) {
      const target = { center: lngLat, zoom: Math.max(instance.getZoom(), 14) };
      if (reducedMotion()) instance.jumpTo(target);
      else instance.easeTo({ ...target, duration: 600 });
    }
  }, [pin]);

  // A place picked in the search box.
  useEffect(() => {
    const instance = map.current;
    if (!instance || !focus) return;
    // Sentinel-2 at 10 m reads best two levels under its limit; the street map at 14.
    const zoom =
      latest.current.basemap === 'satellite'
        ? Math.min(15, satelliteConfig(import.meta.env).maxzoom - 2)
        : 14;
    const target = { center: [focus.lon, focus.lat] as [number, number], zoom };
    if (reducedMotion()) instance.jumpTo(target);
    else instance.flyTo({ ...target, duration: 1200 });
  }, [focus]);

  return (
    <div
      ref={container}
      className="map-canvas"
      role="region"
      aria-label={
        tool === 'outline'
          ? 'Mapa. Tocá cada esquina del lote para dibujar su contorno.'
          : 'Mapa. Tocá el lugar del lote para marcarlo.'
      }
    />
  );
}
