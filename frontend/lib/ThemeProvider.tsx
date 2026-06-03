'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { makeTheme, Theme, ThemeMode } from './theme';

interface ThemeContextValue {
  th: Theme;
  mode: ThemeMode;
  setMode: (m: ThemeMode) => void;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const STORAGE_KEY = 'palova-theme';

export function ThemeProvider({ children, accent, defaultMode }: { children: React.ReactNode; accent?: string; defaultMode?: ThemeMode }) {
  // Default to daylight/paper Palova (or club's defaultMode). Real value is read
  // from localStorage after mount to avoid SSR/client mismatch.
  const [mode, setModeState] = useState<ThemeMode>(defaultMode ?? 'daylight');

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY) as ThemeMode | null;
    if (saved === 'floodlit' || saved === 'daylight') setModeState(saved);
  }, []);

  const setMode = (m: ThemeMode) => {
    setModeState(m);
    localStorage.setItem(STORAGE_KEY, m);
  };

  // accent override (branding par club) — défaut lime si non fourni.
  const th = useMemo(() => makeTheme(mode, { accent, neon: true }), [mode, accent]);

  // Paint the document background so areas outside the app shell match the theme.
  useEffect(() => {
    document.body.style.background = th.bg;
    document.body.style.color = th.text;
  }, [th]);

  const value = useMemo<ThemeContextValue>(
    () => ({ th, mode, setMode, toggle: () => setMode(mode === 'floodlit' ? 'daylight' : 'floodlit') }),
    [th, mode],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within <ThemeProvider>');
  return ctx;
}
