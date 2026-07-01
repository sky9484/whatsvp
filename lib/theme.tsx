'use client';

import { createContext, useContext, useEffect, useState, useCallback } from 'react';

type Theme = 'light' | 'dark';

interface ThemeCtx {
  theme: Theme;
  toggle: () => void;
  setTheme: (t: Theme) => void;
}

const Ctx = createContext<ThemeCtx | null>(null);
const STORAGE_KEY = 'whatsvp-theme';

export function useTheme(): ThemeCtx {
  const ctx = useContext(Ctx);
  return ctx ?? { theme: 'light', toggle: () => {}, setTheme: () => {} };
}

/**
 * Inline script (run in <head> before paint) that applies the persisted theme
 * class to <html> so there's no flash of the wrong theme on load.
 */
export const themeInitScript = `
(function(){try{
  var t = localStorage.getItem('${STORAGE_KEY}');
  if(!t){ t = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'; }
  document.documentElement.classList.toggle('dark', t === 'dark');
}catch(e){}})();
`;

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('light');

  // Sync initial state from the class the inline script already applied.
  useEffect(() => {
    setThemeState(document.documentElement.classList.contains('dark') ? 'dark' : 'light');
  }, []);

  const apply = useCallback((t: Theme) => {
    document.documentElement.classList.toggle('dark', t === 'dark');
    try {
      localStorage.setItem(STORAGE_KEY, t);
    } catch {
      /* storage may be unavailable */
    }
    setThemeState(t);
  }, []);

  const toggle = useCallback(() => {
    apply(document.documentElement.classList.contains('dark') ? 'light' : 'dark');
  }, [apply]);

  return <Ctx.Provider value={{ theme, toggle, setTheme: apply }}>{children}</Ctx.Provider>;
}
