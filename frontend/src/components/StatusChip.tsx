import type { ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

export type ChipTone = 'critical' | 'caution' | 'ok' | 'none' | 'pending';

const ICONS: Record<ChipTone, IconName> = {
  critical: 'snowflake',
  caution: 'alert',
  ok: 'check',
  none: 'thermometer',
  pending: 'clock',
};

/** State is never colour alone: every chip carries an icon and a label. */
export function StatusChip({ tone, children }: { tone: ChipTone; children: ReactNode }) {
  return (
    <span className={`chip chip--${tone}`}>
      <Icon name={ICONS[tone]} size={16} strokeWidth={2.6} />
      {children}
    </span>
  );
}
