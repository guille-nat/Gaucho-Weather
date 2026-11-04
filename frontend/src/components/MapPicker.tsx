import 'maplibre-gl/dist/maplibre-gl.css';
import { Map as MapLibreMap, Marker, NavigationControl, type MapMouseEvent } from 'maplibre-gl';
import { useEffect, useRef } from 'react';

/** OpenFreeMap: OpenStreetMap vector tiles, no API key. */
const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';
/** South of Santa Fe, the initial zone of the product. */
const DEFAULT_CENTER: [number, number] = [-61.6, -33.3];

export interface LatLon {
  lat: number;
  lon: number;
}

interface MapPickerProps {
  value: LatLon | null;
  onPick: (value: LatLon) => void;
}

function stakeElement() {
  // A survey stake ("mojón"): ink pin with the brand gold head.
  const el = document.createElement('div');
  el.className = 'map-stake';
  el.innerHTML =
    '<svg width="34" height="44" viewBox="0 0 34 44" aria-hidden="true"><path d="M17 43S3 27.5 3 16a14 14 0 0 1 28 0c0 11.5-14 27-14 27Z" fill="#141414"/><circle cx="17" cy="16" r="6" fill="#f2b705" stroke="#fff" stroke-width="2"/></svg>';
  return el;
}

const reducedMotion = () =>
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

export default function MapPicker({ value, onPick }: MapPickerProps) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  const marker = useRef<Marker | null>(null);
  const onPickRef = useRef(onPick);
  const initial = useRef(value);

  useEffect(() => {
    onPickRef.current = onPick;
  }, [onPick]);

  useEffect(() => {
    if (!container.current) return;
    const start = initial.current;
    const instance = new MapLibreMap({
      container: container.current,
      style: STYLE_URL,
      center: start ? [start.lon, start.lat] : DEFAULT_CENTER,
      zoom: start ? 14 : 8,
      attributionControl: { compact: true },
      cooperativeGestures: false,
    });
    instance.addControl(new NavigationControl({ showCompass: false }), 'top-right');
    instance.on('click', (event: MapMouseEvent) => {
      onPickRef.current({ lat: event.lngLat.lat, lon: event.lngLat.lng });
    });
    map.current = instance;
    return () => {
      instance.remove();
      map.current = null;
      marker.current = null;
    };
  }, []);

  useEffect(() => {
    const instance = map.current;
    if (!instance) return;
    if (!value) {
      marker.current?.remove();
      marker.current = null;
      return;
    }
    const lngLat: [number, number] = [value.lon, value.lat];
    if (!marker.current) {
      const stake = new Marker({ element: stakeElement(), anchor: 'bottom', draggable: true })
        .setLngLat(lngLat)
        .addTo(instance);
      stake.on('dragend', () => {
        const at = stake.getLngLat();
        onPickRef.current({ lat: at.lat, lon: at.lng });
      });
      marker.current = stake;
    } else {
      marker.current.setLngLat(lngLat);
    }
    if (!instance.getBounds().contains(lngLat)) {
      const target = { center: lngLat, zoom: Math.max(instance.getZoom(), 14) };
      if (reducedMotion()) instance.jumpTo(target);
      else instance.easeTo({ ...target, duration: 600 });
    }
  }, [value]);

  return (
    <div
      ref={container}
      className="map-canvas"
      role="region"
      aria-label="Mapa. Tocá el lugar del lote para marcarlo."
    />
  );
}
