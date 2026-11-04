import { getResponse } from 'msw';
import { demoLotes, demoUser } from './fixtures';
import { createHandlers, createMockDb } from './handlers';

/**
 * `pnpm dev:mock`: the app runs against an in-memory API with three synthetic lotes.
 * `?escenario=vacio` starts with no lotes; `?escenario=anonimo` starts logged out
 * (log in with the demo email and the password `demo1234`).
 *
 * Requests to /api/ are answered in-page by the same MSW handlers the tests use, without a
 * service worker, so the mock also works in headless screenshots.
 */
export function startMockApi() {
  const scenario = new URLSearchParams(window.location.search).get('escenario');
  const db = createMockDb({
    user: scenario === 'anonimo' ? null : demoUser,
    accounts: [{ email: demoUser.email, password: 'demo1234', user: demoUser }],
    lotes: scenario === 'vacio' ? [] : demoLotes(),
  });
  const handlers = createHandlers(db);
  const realFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const request = new Request(input, init);
    if (new URL(request.url).pathname.startsWith('/api/')) {
      const response = await getResponse(handlers, request);
      if (response) return response;
    }
    return realFetch(input, init);
  };
}
