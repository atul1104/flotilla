import { create } from 'zustand';

const THEME_KEY = 'flotilla.theme';

function getInitialTheme() {
  if (typeof window === 'undefined') return 'light';
  const saved = localStorage.getItem(THEME_KEY);
  if (saved === 'light' || saved === 'dark') return saved;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export const useUiStore = create((set, get) => ({
  theme: getInitialTheme(),
  toggleTheme: () => {
    const next = get().theme === 'dark' ? 'light' : 'dark';
    localStorage.setItem(THEME_KEY, next);
    applyTheme(next);
    set({ theme: next });
  },
  setTheme: (t) => {
    localStorage.setItem(THEME_KEY, t);
    applyTheme(t);
    set({ theme: t });
  },
  // composer drafts per channel (Phase 2 will use these heavily)
  drafts: {},
  setDraft: (channelId, text) => set((s) => ({ drafts: { ...s.drafts, [channelId]: text } })),
  clearDraft: (channelId) =>
    set((s) => {
      const next = { ...s.drafts };
      delete next[channelId];
      return { drafts: next };
    }),
}));

export function applyTheme(theme) {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.toggle('dark', theme === 'dark');
}
