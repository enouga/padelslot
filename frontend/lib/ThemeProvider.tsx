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

const STORAGE_KEY = 'slotpadel-theme';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Default to floodlit (the design's primary direction). Real value is read
  // from localStorage after mount to avoid SSR/client mismatch.
  const [mode, setModeState] = useState<ThemeMode>('floodlit');

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY) as ThemeMode | null;
    if (saved === 'floodlit' || saved === 'daylight') setModeState(saved);
  }, []);

  const setMode = (m: ThemeMode) => {
    setModeState(m);
    localStorage.setItem(STORAGE_KEY, m);
  };

  const th = useMemo(() => makeTheme(mode, { accent: undefined, neon: true }), [mode]);

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
