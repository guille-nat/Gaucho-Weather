import type { GeoJsonPolygon } from '../api/types';
import { parcelLabel, projectBoundary, seededQuad, type Box } from '../lib/parcel';

/**
 * Each lote drawn as its parcel, in white line on the sky panel. The level of its most urgent
 * decision tints the fill and is said in the label (never by colour alone); a lote with no
 * forecast yet (`pending`) has a dashed outline and no fill.
 */
export type Severity = 'critical' | 'caution' | 'ok' | 'none';

const SEVERITY_TEXT: Record<Severity, string> = {
  critical: 'alerta',
  caution: 'precaución',
  ok: 'sin problemas',
  none: 'sin aviso todavía',
};

const FILL: Record<Severity, string> = {
  critical: '#ff8a75',
  caution: '#f2b705',
  ok: '#7fe0a0',
  none: 'currentColor',
};

const BOX: Box = { x: 8, y: 10, w: 86, h: 88 };

interface ParcelOutlineProps {
  id: number;
  name: string;
  boundary: GeoJsonPolygon | null;
  severity?: Severity;
  /** No forecast yet: no hatch, dashed outline. */
  pending?: boolean;
  className?: string;
}

export function ParcelOutline({
  id,
  name,
  boundary,
  severity = 'none',
  pending = false,
  className,
}: ParcelOutlineProps) {
  const points = projectBoundary(boundary, BOX) ?? seededQuad(id, BOX);
  const label = parcelLabel(name);
  const cx = BOX.x + BOX.w / 2;
  const cy = BOX.y + BOX.h / 2;
  const long = label.length > 2;
  const fontSize = long ? 26 : 34;
  const state = pending ? 'sin datos aún' : SEVERITY_TEXT[severity];

  return (
    <svg
      className={className}
      viewBox="0 0 120 108"
      role="img"
      aria-label={`Plano del lote ${label}, ${state}`}
    >
      <polygon
        points={points.map((p) => p.join(',')).join(' ')}
        fill={pending ? 'none' : FILL[severity]}
        fillOpacity={pending ? undefined : severity === 'none' ? 0.12 : 0.32}
        stroke="currentColor"
        strokeWidth="3"
        strokeLinejoin="round"
        strokeDasharray={pending ? '7 6' : undefined}
      />
      <text
        x={cx}
        y={cy + fontSize * 0.36}
        fontSize={fontSize}
        fontWeight="600"
        textAnchor="middle"
        fill="currentColor"
      >
        {label}
      </text>
    </svg>
  );
}
