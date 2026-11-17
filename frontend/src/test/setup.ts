import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';
import { onlineManager } from '@tanstack/react-query';
import { cleanup } from '@testing-library/react';
import { del } from 'idb-keyval';
import { afterAll, afterEach, beforeAll, vi } from 'vitest';
import { PERSIST_KEY } from '../query/persister';
import { server } from './server';

// jsdom has no modal dialog: open/close and the close event, nothing else. Focus containment and
// focus return are the browser's, checked in a real browser, not here.
if (!('showModal' in HTMLDialogElement.prototype)) {
  Object.assign(HTMLDialogElement.prototype, {
    showModal(this: HTMLDialogElement) {
      this.setAttribute('open', '');
    },
    close(this: HTMLDialogElement, returnValue?: string) {
      if (!this.hasAttribute('open')) return;
      if (returnValue !== undefined) this.returnValue = returnValue;
      this.removeAttribute('open');
      this.dispatchEvent(new Event('close'));
    },
  });
}

// jsdom draws nothing and logs "not implemented" for every canvas: answer like a browser
// without a 2D context, which the animated sky already handles by drawing nothing.
HTMLCanvasElement.prototype.getContext = (() =>
  null) as typeof HTMLCanvasElement.prototype.getContext;

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));

afterEach(async () => {
  cleanup();
  server.resetHandlers();
  onlineManager.setOnline(true);
  document.cookie = 'csrftoken=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
  await del(PERSIST_KEY);
  localStorage.clear();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

afterAll(() => server.close());
