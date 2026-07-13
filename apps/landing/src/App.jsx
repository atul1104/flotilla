import { ArrowRight } from 'lucide-react';
import Testimonials from './components/Testimonials.jsx';
import ThemeToggle from './components/ThemeToggle.jsx';

// Dev preview points at the local web app; prod swaps to app.flotilla.dev (Phase 7).
const APP_URL = import.meta.env.VITE_APP_URL ?? 'http://localhost:5173';

function Nav() {
  return (
    <header className="sticky top-0 z-20 border-b border-border bg-bg/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <a href="/" className="flex items-center gap-2">
          <span className="h-5 w-5 bg-brand" aria-hidden="true" />
          <span className="text-lg font-bold tracking-tight">Flotilla</span>
        </a>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <a
            href={APP_URL}
            className="hidden items-center gap-1 border border-border px-3 py-2 text-sm font-medium transition-colors hover:bg-bg-subtle sm:inline-flex"
          >
            Sign in
          </a>
          <a
            href={APP_URL}
            className="inline-flex items-center gap-1 bg-brand px-3 py-2 text-sm font-semibold text-accent-fg transition-opacity hover:opacity-90"
          >
            Open the app <ArrowRight className="h-4 w-4" />
          </a>
        </div>
      </div>
    </header>
  );
}

function Footer() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-6xl flex-col gap-2 px-6 py-8 text-sm text-fg-muted sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 bg-brand" aria-hidden="true" />
          <span>Flotilla — humans + AI agents, as teammates.</span>
        </div>
        <p className="font-mono text-xs">Private beta · the full landing site ships in Phase 7</p>
      </div>
    </footer>
  );
}

export default function App() {
  return (
    <div className="flex min-h-full flex-col">
      <Nav />
      {/* Hero is Phase 7; the testimonials section is the live surface for now. */}
      <main className="flex-1">
        <Testimonials />
      </main>
      <Footer />
    </div>
  );
}
