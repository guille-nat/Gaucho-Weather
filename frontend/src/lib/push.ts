import type { PushSubscriptionInput } from '../api/types';

/**
 * Web Push in this browser (cuenta-planes-alertas S7). Small functions over the browser APIs so
 * the screens and their tests do not touch `navigator.serviceWorker` directly. The service worker
 * (src/sw.ts) shows the notifications.
 */

/** False on browsers without Web Push, e.g. Safari on iPhone outside a home-screen app. */
export function pushSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    'serviceWorker' in navigator &&
    typeof window !== 'undefined' &&
    'PushManager' in window &&
    'Notification' in window
  );
}

/** 'default' until the person answers the browser's prompt. */
export function permission(): NotificationPermission {
  return pushSupported() ? Notification.permission : 'default';
}

/** Shows the browser's prompt; call it only from a tap, browsers ignore it otherwise. */
export function requestPermission(): Promise<NotificationPermission> {
  return Notification.requestPermission();
}

async function subscription(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null;
  // Not `ready`: it never settles where no worker is registered (e.g. `pnpm dev`).
  const registration = await navigator.serviceWorker.getRegistration();
  return (await registration?.pushManager.getSubscription()) ?? null;
}

/** The push endpoint of this browser, or null when it is not subscribed. */
export async function currentEndpoint(): Promise<string | null> {
  return (await subscription())?.endpoint ?? null;
}

/** VAPID keys travel as base64url; the browser wants the raw bytes. */
export function urlBase64ToUint8Array(base64url: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64url.length % 4)) % 4);
  const base64 = (base64url + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

/** Subscribes this browser with the server's VAPID public key. */
export async function subscribeBrowser(publicKey: string): Promise<PushSubscriptionInput> {
  // `ready` here, unlike `subscription()`: subscribing needs an active worker, so waiting for
  // it is right. The caller only gets here after `pushSupported()` on a tap.
  const registration = await navigator.serviceWorker.ready;
  const created = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey),
  });
  const json = created.toJSON();
  return {
    endpoint: created.endpoint,
    keys: { p256dh: json.keys?.p256dh ?? '', auth: json.keys?.auth ?? '' },
  };
}

/** Stops push in this browser; nothing to do when it was not subscribed. */
export async function unsubscribeBrowser(): Promise<void> {
  await (await subscription())?.unsubscribe();
}
