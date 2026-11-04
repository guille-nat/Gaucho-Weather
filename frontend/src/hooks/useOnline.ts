import { onlineManager } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';

/** Online state as TanStack Query sees it (window online/offline events). */
export function useOnline(): boolean {
  return useSyncExternalStore(
    (notify) => onlineManager.subscribe(notify),
    () => onlineManager.isOnline(),
    () => true,
  );
}
