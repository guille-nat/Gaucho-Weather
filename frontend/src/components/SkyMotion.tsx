import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Forecast } from '../api/types';
import { sceneFor } from '../lib/atmosphere';
import { runSky, setSkyPaused, useReducedMotion, useSkyPaused } from '../lib/skyMotion';
import { Icon } from './Icon';

/**
 * The weather of this hour, moving behind the forecast (cielo-animado, S4). Decorative: the hero
 * already says it in words. Only the forecast screens mount it; the rest keep the plain sky.
 */
export function SkyMotion({ forecast }: { forecast: Forecast }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const scene = useMemo(() => sceneFor(forecast), [forecast]);
  const paused = useSkyPaused();
  const reduced = useReducedMotion();
  const still = paused || reduced;
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (!canvas.current) return undefined;
    const stop = runSky(canvas.current, scene, still);
    setShown(true);
    return stop;
  }, [scene, still]);

  return createPortal(
    <canvas
      ref={canvas}
      className="sky-motion"
      data-shown={shown || undefined}
      aria-hidden="true"
    />,
    document.body,
  );
}

/** Stops or restarts the moving sky (WCAG 2.2.2); absent when nothing would move. */
export function SkyPause({ forecast }: { forecast: Forecast }) {
  const moving = useMemo(() => sceneFor(forecast).moving, [forecast]);
  const paused = useSkyPaused();
  const reduced = useReducedMotion();
  if (!moving || reduced) return null;
  const label = paused ? 'Mover el cielo' : 'Pausar el cielo';
  return (
    <button
      type="button"
      className="icon-btn sky-pause"
      aria-label={label}
      title={label}
      onClick={() => setSkyPaused(!paused)}
    >
      {/* Both icons stay in the DOM and cross-fade, so the swap has an exit too. */}
      <span className="icon-swap" data-shown={paused ? 'play' : 'pause'}>
        <Icon name="pause" size={22} strokeWidth={2.2} data-icon="pause" />
        <Icon name="play" size={22} strokeWidth={2.2} data-icon="play" />
      </span>
    </button>
  );
}
