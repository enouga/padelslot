// theme.ts — SlotPadel design system ported to the real app.
// Two directions: "floodlit" (dark, night-match) and "daylight" (light, paper).
// Fonts are loaded by next/font (see app/layout.tsx) and exposed as CSS vars.

export type ThemeMode = 'floodlit' | 'daylight';

const FONT_DISPLAY = 'var(--font-display), Georgia, serif';
const FONT_UI = 'var(--font-ui), -apple-system, system-ui, sans-serif';
const FONT_MONO = 'var(--font-mono), ui-monospace, monospace';

// Curated accent options.
export const ACCENTS = {
  lime: '#d6ff3f',
  cyan: '#46e6d0',
  coral: '#ff7a4d',
  violet: '#bda6ff',
} as const;

export type AccentKey = keyof typeof ACCENTS;

/** Pick legible ink for text/icons sitting on top of an accent fill. */
export function inkOn(hex: string): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  const L = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return L > 0.45 ? '#15140f' : '#f7f6f0';
}

export interface Theme {
  mode: ThemeMode;
  accent: string;
  onAccent: string;
  neon: boolean;
  fontDisplay: string;
  fontUI: string;
  fontMono: string;
  canvas: string;
  bg: string;
  bgElev: string;
  surface: string;
  surface2: string;
  surfaceHi: string;
  line: string;
  lineStrong: string;
  text: string;
  textMute: string;
  textFaint: string;
  takenBg: string;
  takenText: string;
  ink: string;
  statusDark: boolean;
  shadow: string;
  shadowSoft: string;
  glow: string;
}

interface MakeThemeOpts {
  accent?: string;
  neon?: boolean;
}

export function makeTheme(mode: ThemeMode, opts: MakeThemeOpts = {}): Theme {
  const accent = opts.accent || ACCENTS.lime;
  const onAccent = inkOn(accent);
  const neon = opts.neon !== false;

  if (mode === 'daylight') {
    return {
      mode, accent, onAccent, neon: false,
      fontDisplay: FONT_DISPLAY, fontUI: FONT_UI, fontMono: FONT_MONO,
      canvas: '#e7e3d8',
      bg: '#f1eee5',
      bgElev: '#f7f5ee',
      surface: '#ffffff',
      surface2: '#f4f1e8',
      surfaceHi: '#ece9df',
      line: 'rgba(24,21,14,0.10)',
      lineStrong: 'rgba(24,21,14,0.20)',
      text: '#181510',
      textMute: '#6d6a5d',
      textFaint: '#a4a092',
      takenBg: 'rgba(24,21,14,0.045)',
      takenText: '#b4b0a2',
      ink: '#181510',
      statusDark: false,
      shadow: '0 1px 2px rgba(24,21,14,0.05), 0 8px 28px rgba(24,21,14,0.07)',
      shadowSoft: '0 1px 3px rgba(24,21,14,0.06)',
      glow: 'none',
    };
  }

  // floodlit (dark)
  return {
    mode, accent, onAccent, neon,
    fontDisplay: FONT_DISPLAY, fontUI: FONT_UI, fontMono: FONT_MONO,
    canvas: '#0a0a0a',
    bg: '#131312',
    bgElev: '#1a1a18',
    surface: '#1c1c1a',
    surface2: '#232321',
    surfaceHi: '#2b2b28',
    line: 'rgba(255,255,255,0.08)',
    lineStrong: 'rgba(255,255,255,0.15)',
    text: '#f4f3ec',
    textMute: '#a5a499',
    textFaint: '#6e6d63',
    takenBg: 'rgba(255,255,255,0.035)',
    takenText: '#5f5e55',
    ink: '#131312',
    statusDark: true,
    shadow: '0 2px 6px rgba(0,0,0,0.4), 0 20px 50px rgba(0,0,0,0.45)',
    shadowSoft: '0 1px 3px rgba(0,0,0,0.4)',
    glow: '0 0 0 1px rgba(214,255,63,0.0)',
  };
}
