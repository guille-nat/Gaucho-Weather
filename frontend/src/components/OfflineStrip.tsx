import { formatTime } from '../lib/format';
import { Icon } from './Icon';

/** No signal: the data on screen is the last good copy, labelled with when the server made it. */
export function OfflineStrip({ servedAt }: { servedAt: number }) {
  return (
    <p className="offline-strip" role="status">
      <Icon name="cloudOff" />
      <span>Sin conexión · datos de las {formatTime(servedAt)}</span>
    </p>
  );
}
