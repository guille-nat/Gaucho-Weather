import { useId } from 'react';

const GOLD = '#f2b705';
const INK = '#1d1600';
const CELESTE = '#8fd0ff';

type BrandMarkProps = {
  size?: number;
  /** `salute`: the gaucho lifts his hat once on mount. `loop`: he keeps saluting (loading). */
  motion?: 'none' | 'salute' | 'loop';
  className?: string;
};

/**
 * The brand mark: a traditional gaucho (chambergo, beard, poncho and a celeste neckerchief)
 * in front of the pampa sun. Below 24 px the eyes and the gold stripes drop out, so the
 * silhouette stays clean in the tab bar and the favicon.
 */
export function BrandMark({ size = 20, motion = 'none', className }: BrandMarkProps) {
  const clip = useId();
  const detailed = size >= 24;
  const classes = ['brand-mark', motion !== 'none' && `brand-mark--${motion}`, className]
    .filter(Boolean)
    .join(' ');
  return (
    <svg
      className={classes}
      width={size}
      height={size}
      viewBox="0 0 64 64"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <clipPath id={clip}>
          <circle cx="32" cy="32" r="30" />
        </clipPath>
      </defs>
      <circle cx="32" cy="32" r="30" fill={GOLD} />
      <g fill={INK}>
        {/* Hair, beard and moustache */}
        <path d="M21.2 28.8Q19.8 32.6 20.6 36.4L23 35.4Q22.8 32 23.6 28.8Z" />
        <path d="M42.8 28.8Q44.2 32.6 43.4 36.4L41 35.4Q41.2 32 40.4 28.8Z" />
        <path d="M21.6 38Q22 46.6 32 51.2 42 46.6 42.4 38 40 43 32 44.4 24 43 21.6 38Z" />
        <path d="M32 35.6C29 34.6 25.4 35.4 23.6 38.8 25 40.6 27 41 29 40.2 30.2 39.8 31.2 39.4 32 39.4 32.8 39.4 33.8 39.8 35 40.2 37 41 39 40.6 40.4 38.8 38.6 35.4 35 34.6 32 35.6Z" />
        {detailed && (
          <>
            <path d="M25.4 31.4Q27.4 30.2 29.4 31.4 27.4 32.4 25.4 31.4Z" />
            <path d="M34.6 31.4Q36.6 30.2 38.6 31.4 36.6 32.4 34.6 31.4Z" />
          </>
        )}
        {/* Poncho over the shoulders, open at the throat */}
        <path
          clipPath={`url(#${clip})`}
          d="M2 66C4 56 13 50.6 24 49.4L32 56 40 49.4C51 50.6 60 56 62 66Z"
        />
      </g>
      <path d="M26.6 50.6H37.4L32 56.2Z" fill={CELESTE} />
      {detailed && (
        <path
          clipPath={`url(#${clip})`}
          d="M2 58.4Q32 54.4 62 58.4V60.4Q32 56.4 2 60.4Z"
          fill={GOLD}
        />
      )}
      {/* The chambergo, its own group so it can be lifted in a salute */}
      <g className="brand-mark__hat">
        <path
          d="M20.6 26 22 16.4Q27 15 32 15.8 37 15 42 16.4L43.4 26ZM4.2 27.4Q32 22.6 59.8 27.4 59.4 29 57 29.4 32 27 7 29.4 4.6 29 4.2 27.4Z"
          fill={INK}
        />
        {detailed && <path d="M21.3 22.6H42.7L42.95 24.4H21.05Z" fill={GOLD} />}
      </g>
    </svg>
  );
}
