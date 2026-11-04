import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { AppRoutes } from '../App';
import { AppProviders } from '../AppProviders';
import { createHandlers, createMockDb, type MockDb } from '../mocks/handlers';
import { createQueryClient } from '../query/client';
import { createIdbPersister } from '../query/persister';
import { server } from './server';

export function renderApp(route = '/', db: MockDb = createMockDb()) {
  server.use(...createHandlers(db));
  const queryClient = createQueryClient({ retry: false });
  const user = userEvent.setup();
  const utils = render(
    <AppProviders queryClient={queryClient} persister={createIdbPersister()}>
      <MemoryRouter initialEntries={[route]}>
        <AppRoutes />
      </MemoryRouter>
    </AppProviders>,
  );
  return { ...utils, user, db, queryClient };
}
