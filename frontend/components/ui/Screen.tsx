'use client';

import { CSSProperties, ReactNode } from 'react';
import { useTheme } from '@/lib/ThemeProvider';

/**
 * Mobile-first app shell: a centered column (max 480px on desktop, full width on
 * phones) painted with the current theme background. The design was drawn for a
 * 390px device, so we cap the width and center it.
 */
export function Screen({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  const { th } = useTheme();
  return (
    <div style={{ minHeight: '100vh', width: '100%', display: 'flex', justifyContent: 'center', background: th.bg }}>
      <div style={{ width: '100%', maxWidth: 480, minHeight: '100vh', position: 'relative', background: th.bg, ...style }}>
        {children}
      </div>
    </div>
  );
}
