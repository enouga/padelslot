// tokens.jsx — SlotPadel design system: themes, accents, icons.
// Two directions: "floodlit" (dark, night-match) and "daylight" (light, editorial paper).
// Shared type system: Cormorant Garamond (display serif), Hanken Grotesk (UI),
// JetBrains Mono (data / countdowns / codes).

const FONT_DISPLAY = "'Cormorant Garamond', Georgia, serif";
const FONT_UI = "'Hanken Grotesk', -apple-system, system-ui, sans-serif";
const FONT_MONO = "'JetBrains Mono', ui-monospace, monospace";

// Curated accent options for the Tweaks panel.
const ACCENTS = {
  lime:    '#d6ff3f',
  cyan:    '#46e6d0',
  coral:   '#ff7a4d',
  violet:  '#bda6ff',
};

// Pick legible ink for text/icons sitting on top of an accent fill.
function inkOn(hex) {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const lin = (c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  const L = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return L > 0.45 ? '#15140f' : '#f7f6f0';
}

function makeTheme(mode, opts) {
  // opts may be a hex string (legacy) or { accent, serif, neon }.
  const o = (typeof opts === 'string' || !opts) ? { accent: opts } : opts;
  const accent = o.accent || ACCENTS.lime;
  const onAccent = inkOn(accent);
  const fontDisplay = o.serif === 'spectral' ? "'Spectral', Georgia, serif" : FONT_DISPLAY;
  const neon = o.neon !== false; // default on for floodlit
  if (mode === 'daylight') {
    return {
      mode, accent, onAccent, neon: false,
      fontDisplay, fontUI: FONT_UI, fontMono: FONT_MONO,
      canvas: '#e7e3d8',           // backdrop behind the device
      bg: '#f1eee5',               // app background (warm paper)
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
      statusDark: false,           // dark glyphs on light status bar
      shadow: '0 1px 2px rgba(24,21,14,0.05), 0 8px 28px rgba(24,21,14,0.07)',
      shadowSoft: '0 1px 3px rgba(24,21,14,0.06)',
      glow: 'none',
    };
  }
  // floodlit (dark)
  return {
    mode, accent, onAccent, neon,
    fontDisplay, fontUI: FONT_UI, fontMono: FONT_MONO,
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
    statusDark: true,            // light glyphs on dark status bar
    shadow: '0 2px 6px rgba(0,0,0,0.4), 0 20px 50px rgba(0,0,0,0.45)',
    shadowSoft: '0 1px 3px rgba(0,0,0,0.4)',
    glow: '0 0 0 1px rgba(214,255,63,0.0)',
  };
}

// fix surfaceHi typo cleanly (kept literal above for clarity)
function daySurfaceHi() { return '#ece9df'; }

// ─────────────────────────────────────────────────────────────
// Icon set — line icons, 1.7 stroke. Pass name, size, color.
// ─────────────────────────────────────────────────────────────
function Icon({ name, size = 20, color = 'currentColor', stroke = 1.7, fill = 'none', style }) {
  const p = { fill, stroke: color, strokeWidth: stroke, strokeLinecap: 'round', strokeLinejoin: 'round' };
  const paths = {
    calendar: <><rect x="3" y="4.5" width="18" height="16.5" rx="2.5" {...p}/><path d="M3 9h18M8 2.5v4M16 2.5v4" {...p}/></>,
    clock: <><circle cx="12" cy="12" r="9" {...p}/><path d="M12 7.5V12l3.5 2" {...p}/></>,
    pin: <><path d="M12 21s7-5.5 7-11a7 7 0 10-14 0c0 5.5 7 11 7 11z" {...p}/><circle cx="12" cy="10" r="2.5" {...p}/></>,
    check: <path d="M4.5 12.5l5 5 10-11" {...p}/>,
    bolt: <path d="M13 2L4.5 13.5H11L10 22l8.5-11.5H12L13 2z" fill={color} stroke={color} strokeWidth="0.5" strokeLinejoin="round"/>,
    user: <><circle cx="12" cy="8" r="4" {...p}/><path d="M4.5 20.5c1.5-4 13.5-4 15 0" {...p}/></>,
    lock: <><rect x="4.5" y="10.5" width="15" height="10.5" rx="2.5" {...p}/><path d="M8 10.5V7a4 4 0 018 0v3.5" {...p}/></>,
    mail: <><rect x="3" y="5" width="18" height="14" rx="2.5" {...p}/><path d="M3.5 6.5l8.5 6 8.5-6" {...p}/></>,
    chevL: <path d="M14.5 5l-7 7 7 7" {...p}/>,
    chevR: <path d="M9.5 5l7 7-7 7" {...p}/>,
    arrowR: <path d="M4 12h15m-6-6l6 6-6 6" {...p}/>,
    plus: <path d="M12 5v14M5 12h14" {...p}/>,
    card: <><rect x="3" y="5" width="18" height="14" rx="2.5" {...p}/><path d="M3 9.5h18" {...p}/></>,
    x: <path d="M6 6l12 12M18 6L6 18" {...p}/>,
    search: <><circle cx="11" cy="11" r="7" {...p}/><path d="M16 16l4.5 4.5" {...p}/></>,
    bell: <><path d="M6 9a6 6 0 0112 0c0 6 2 7 2 7H4s2-1 2-7z" {...p}/><path d="M10 20a2 2 0 004 0" {...p}/></>,
    indoor: <><rect x="4" y="4" width="16" height="16" rx="2" {...p}/><path d="M12 4v16M4 12h16" {...p}/></>,
    sun: <><circle cx="12" cy="12" r="4.5" {...p}/><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M5 5l1.8 1.8M17.2 17.2L19 19M19 5l-1.8 1.8M6.8 17.2L5 19" {...p}/></>,
    users: <><circle cx="9" cy="8" r="3.5" {...p}/><path d="M3 20c1-3.5 11-3.5 12 0M16 5a3.5 3.5 0 010 6.5M17 14c3 .5 4.5 2.5 4.5 4.5" {...p}/></>,
    euro: <><path d="M18 7.5A6.5 6.5 0 1018 16.5M5 10.5h8M5 13.5h7" {...p}/></>,
    grid: <><rect x="3.5" y="3.5" width="7" height="7" rx="1.5" {...p}/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5" {...p}/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5" {...p}/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5" {...p}/></>,
    chart: <><path d="M4 20V4M4 20h16" {...p}/><path d="M8 16l4-5 3 3 4-7" {...p}/></>,
    ticket: <><path d="M3 8a2 2 0 012-2h14a2 2 0 012 2 2 2 0 000 4 2 2 0 000 4 2 2 0 01-2 2H5a2 2 0 01-2-2 2 2 0 000-4 2 2 0 000-4z" {...p}/><path d="M14 6v12" {...p} strokeDasharray="2 2.5"/></>,
    settings: <><circle cx="12" cy="12" r="3" {...p}/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9L17 7M7 17l-2.1 2.1" {...p}/></>,
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ display: 'block', flexShrink: 0, ...style }}>
      {paths[name] || null}
    </svg>
  );
}

Object.assign(window, { makeTheme, daySurfaceHi, ACCENTS, inkOn, Icon, FONT_DISPLAY, FONT_UI, FONT_MONO });
