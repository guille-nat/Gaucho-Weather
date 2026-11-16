import { useId, useState } from 'react';
import { FOUNDER_LIMIT, founderLabel } from '../lib/membership';
import { Icon } from './Icon';

/**
 * What being a founder means (S13). Only what is true: one of the first 100, Productor free for
 * good, a number nobody else gets, and thanks. No benefit is invented here.
 */
export function FounderStory({ number }: { number: number }) {
  return (
    <div className="founder-story">
      <p className="founder-story-lead">
        Sos founder n.º {number}: una de las primeras {FOUNDER_LIMIT} personas que confiaron en
        Gaucho Weather.
      </p>
      <ul className="founder-story-facts">
        <li>
          <Icon name="check" size={20} strokeWidth={2.4} />
          <span>Tenés el plan Productor gratis para siempre.</span>
        </li>
        <li>
          <Icon name="check" size={20} strokeWidth={2.4} />
          <span>El n.º {number} es tuyo para siempre: nadie más lo va a tener.</span>
        </li>
      </ul>
      <p className="founder-story-thanks">
        Gracias por ayudarnos a construir Gaucho Weather desde el principio.
      </p>
    </div>
  );
}

/** The gold seal itself: a sun and the number, readable as text, never colour alone. */
function Seal({ number }: { number: number }) {
  return (
    <>
      <Icon className="founder-badge-sun" name="sun" size={18} strokeWidth={2.2} />
      <span className="founder-badge-text">{founderLabel(number)}</span>
    </>
  );
}

/**
 * The founder badge (S13). `explain` makes it a button that opens the story right below it;
 * without it the badge is a plain mark, for pages that already tell the story.
 */
export function FounderBadge({ number, explain = false }: { number: number; explain?: boolean }) {
  const [open, setOpen] = useState(false);
  const storyId = useId();
  const titleId = useId();

  if (!explain) {
    return (
      <span className="founder-badge">
        <Seal number={number} />
      </span>
    );
  }
  return (
    <div className="founder">
      <button
        type="button"
        className="founder-badge founder-badge--button"
        aria-expanded={open}
        aria-controls={storyId}
        onClick={() => setOpen((value) => !value)}
      >
        <Seal number={number} />
        <Icon className="founder-badge-chevron" name="chevronRight" size={16} strokeWidth={2.6} />
      </button>
      <section id={storyId} className="founder-popover" aria-labelledby={titleId} hidden={!open}>
        <h2 className="founder-popover-title" id={titleId}>
          Sos founder
        </h2>
        <FounderStory number={number} />
      </section>
    </div>
  );
}
