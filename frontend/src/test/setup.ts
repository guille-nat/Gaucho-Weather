import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';
import { onlineManager } from '@tanstack/react-query';
import { cleanup } from '@testing-library/react';
import { del } from 'idb-keyval';
import { afterAll, afterEach, beforeAll, vi } from 'vitest';
import { PERSIST_KEY } from '../query/persister';
import { server } from './server';

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
