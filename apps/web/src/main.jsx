import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import * as Sentry from '@sentry/react';
import { App } from './App';
import { queryClient } from './lib/queryClient';
import { AuthProvider } from './context/AuthProvider';
import { useUiStore, applyTheme } from './store/uiStore';
import { registerSW } from './lib/push';
import './index.css';

// Apply persisted theme before first paint (avoid flash).
applyTheme(useUiStore.getState().theme);

// Register the service worker (PWA + push receiver). Best-effort.
registerSW();

// Phase 8 — Sentry (no-op without VITE_SENTRY_DSN).
if (import.meta.env.VITE_SENTRY_DSN) {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    environment: import.meta.env.MODE,
    tracesSampleRate: import.meta.env.PROD ? 0.1 : 1.0,
  });
}

function Root() {
  return (
    <React.StrictMode>
      <Sentry.ErrorBoundary
        fallback={
          <div className="flex h-full items-center justify-center p-6 text-center">
            <div>
              <p className="font-mono text-2xl font-bold">Something went wrong.</p>
              <p className="mt-2 text-sm text-[var(--color-fg-muted)]">
                The page crashed. Reload to continue.
              </p>
            </div>
          </div>
        }
      >
        <QueryClientProvider client={queryClient}>
          <BrowserRouter>
            <AuthProvider>
              <App />
            </AuthProvider>
          </BrowserRouter>
          <ReactQueryDevtools initialIsOpen={false} />
        </QueryClientProvider>
      </Sentry.ErrorBoundary>
    </React.StrictMode>
  );
}

createRoot(document.getElementById('root')).render(<Root />);
