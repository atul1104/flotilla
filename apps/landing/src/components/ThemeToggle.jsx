import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';

// Mirrors the web app's class-based dark mode (PLAN.md §3). The pre-paint
// script in index.html sets the initial class; this keeps a manual toggle in sync.
function applyTheme(dark) {
  document.documentElement.classList.toggle('dark', dark);
  try {
    localStorage.setItem('flotilla-theme', dark ? 'dark' : 'light');
  } catch {
    /* ignore storage failures */
  }
}

export default function ThemeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.classList.contains('dark'));
  }, []);

  return (
    <button
      type="button"
      onClick={() => {
        const next = !dark;
        setDark(next);
        applyTheme(next);
      }}
      aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
      title={dark ? 'Switch to light theme' : 'Switch to dark theme'}
      className="flex h-9 w-9 items-center justify-center border border-border text-fg transition-colors hover:bg-bg-subtle"
    >
      {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}
