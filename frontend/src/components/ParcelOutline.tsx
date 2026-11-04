import { useId } from 'react';
import type { GeoJsonPolygon } from '../api/types';
import { formatHa } from '../lib/format';
import { parcelLabel, projectBoundary, seededQuad, type Box } from '../lib/parcel';

/**
 * The signature of the direction: each lote drawn as a surveyed parcel, hatched by severity.
 * Phase 1 has no decision engine, so every lote uses `none` ("sin veredicto"); Phase 2 only
 * has to pass a severity.
 */
export type Severity = 'critical' | 'caution' | 'ok' | 'none';

const SEVERITY_TEXT: Record<Severity, string> = {
  critical: 'riesgo alto',
  caution: 'precaución',
  ok: 'sin riesgo',
  none: 'sin aviso todavía',
};

const BOX: Box = { x: 5, y: 8, w: 90, h: 94 };
const INK = '#141414';

function Hatch({ id, severity }: { id: string; severity: Severity }) {
  switch (severity) {
    case 'critical':
      return (
        <pattern
          id={id}
          width="6"
          height="6"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <path d="M0 0V6M0 0H6" stroke="#c8102e" strokeWidth="1.8" />
        </pattern>
      );
    case 'caution':
      return (
        <pattern
          id={id}
          width="8"
          height="8"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(-45)"
        >
          <path d="M0 0V8" stroke="#c77700" strokeWidth="2.4" />
        </pattern>
      );
    case 'ok':
      return (
        <pattern id={id} width="9" height="9" patternUnits="userSpaceOnUse">
          <circle cx="4.5" cy="4.5" r="1.6" fill="#1f7a3a" />
        </pattern>
      );
    case 'none':
      return (
        <pattern
          id={id}
          width="7"
          height="7"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <path d="M0 0V7" stroke="#9a9a94" strokeWidth="1" />
        </pattern>
      );
  }
}

interface ParcelOutlineProps {
  id: number;
  name: string;
  boundary: GeoJsonPolygon | null;
  areaHa?: number | null;
  severity?: Severity;
  className?: string;
}

export function ParcelOutline({
  id,
  name,
  boundary,
  areaHa = null,
  severity = 'none',
  className,
}: ParcelOutlineProps) {
  const patternId = `hatch-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const points = projectBoundary(boundary, BOX) ?? seededQuad(id, BOX);
  const label = parcelLabel(name);
  const cx = BOX.x + BOX.w / 2;
  const cy = BOX.y + BOX.h / 2;
  const tag = { w: label.length > 2 ? 50 : 40, h: areaHa ? 40 : 32 };

  return (
    <svg
      className={className}
      viewBox="0 0 120 108"
      role="img"
      aria-label={`Plano del lote ${label}, ${SEVERITY_TEXT[severity]}`}
    >
      <defs>
        <Hatch id={patternId} severity={severity} />
      </defs>
      <polygon
        points={points.map((p) => p.join(',')).join(' ')}
        fill={`url(#${patternId})`}
        stroke={INK}
        strokeWidth="2.6"
        strokeLinejoin="miter"
      />
      <rect
        x={cx - tag.w / 2}
        y={cy - tag.h / 2}
        width={tag.w}
        height={tag.h}
        fill="#fff"
        stroke={INK}
        strokeWidth="1"
      />
      <text
        x={cx}
        y={areaHa ? cy + 6 : cy + 9}
        fontSize={label.length > 2 ? 19 : 26}
        fontWeight="700"
        textAnchor="middle"
        fill={INK}
      >
        {label}
      </text>
      {areaHa ? (
        <text x={cx} y={cy + 16} fontSize="10" fontWeight="600" textAnchor="middle" fill={INK}>
          {formatHa(areaHa)}
        </text>
      ) : null}
      <g aria-hidden="true">
        <path d="M110 4l6 15-6-4-6 4z" fill={INK} />
        <text x="110" y="31" fontSize="11" fontWeight="700" textAnchor="middle" fill={INK}>
          N
        </text>
      </g>
    </svg>
  );
}
