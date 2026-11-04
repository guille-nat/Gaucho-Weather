/**
 * The gaucho appears here, and only here in Phase 1: the welcome to an empty plan.
 * Drawn in the same survey line as the parcels, beside the first (still unsurveyed) lote.
 */
export function GauchoEmpty() {
  return (
    <svg className="gaucho-empty" viewBox="0 0 220 150" aria-hidden="true" focusable="false">
      <g
        fill="none"
        stroke="#141414"
        strokeWidth="2.6"
        strokeLinejoin="round"
        strokeLinecap="round"
      >
        {/* Chambergo hat */}
        <path d="M16 56c14-7 50-7 64 0" />
        <path d="M30 53c0-13 6-20 18-20s18 7 18 20" />
        <path d="M31 47c11-3 23-3 34 0" />
        {/* Head and drooping moustache */}
        <path d="M37 58c0 10 5 16 11 16s11-6 11-16" />
        <path d="M41 67c2-3 5-3 7-1 2-2 5-2 7 1" />
        {/* Poncho */}
        <path d="M48 80 88 134H8Z" fill="#fff" />
        <path d="M17 124h62M13 129h70" />
        {/* Unsurveyed parcel, dashed */}
        <path d="M116 44 196 32l12 86-84 14Z" strokeDasharray="7 6" strokeWidth="2.2" />
        <path d="M136 4l5 13-5-3.5-5 3.5z" fill="#141414" strokeWidth="1" />
      </g>
      {/* Neckerchief and boundary stake: the only pink, the brand marks */}
      <path d="M40 76h16l-8 10Z" fill="#d6336c" />
      <path d="M196 24l8 8-8 8-8-8Z" fill="#d6336c" />
      <text x="136" y="30" fontSize="11" fontWeight="700" textAnchor="middle" fill="#141414">
        N
      </text>
    </svg>
  );
}
