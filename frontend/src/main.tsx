import '@fontsource/atkinson-hyperlegible-next/latin-400.css';
import '@fontsource/atkinson-hyperlegible-next/latin-700.css';
import '@fontsource/onest/latin-300.css';
import '@fontsource/onest/latin-500.css';
import '@fontsource/onest/latin-600.css';
import './styles/tokens.css';
import './styles/base.css';
import './styles/app.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { AppRoutes } from './App';
import { AppProviders } from './AppProviders';
import { createQueryClient } from './query/client';
import { createIdbPersister } from './query/persister';
import { restoreSky } from './lib/sky';

async function start() {
  if (import.meta.env.MODE === 'mock') {
    const { startMockApi } = await import('./mocks/browser');
    startMockApi();
  }
  if (import.meta.env.PROD) {
    const { registerSW } = await import('virtual:pwa-register');
    registerSW({ immediate: true });
  }

  // Open on the last sky seen here, not on a default colour that then fades away.
  restoreSky();
  const root = document.getElementById('root');
  if (!root) throw new Error('Missing #root');
  createRoot(root).render(
    <StrictMode>
      <AppProviders queryClient={createQueryClient()} persister={createIdbPersister()}>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </AppProviders>
    </StrictMode>,
  );
}

void start();
