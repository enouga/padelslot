import { CSSProperties, ReactNode } from 'react';

export type IconName =
  | 'calendar' | 'clock' | 'pin' | 'check' | 'bolt' | 'user' | 'lock' | 'mail'
  | 'chevL' | 'chevR' | 'arrowR' | 'plus' | 'card' | 'x' | 'search' | 'bell'
  | 'indoor' | 'sun' | 'users' | 'euro' | 'grid' | 'chart' | 'ticket' | 'settings'
  | 'moon' | 'logout' | 'grip' | 'trophy' | 'eye' | 'eyeOff';

interface IconProps {
  name: IconName;
  size?: number;
  color?: string;
  stroke?: number;
  fill?: string;
  style?: CSSProperties;
}

// Line icons, 1.7 stroke by default. Pass name, size, color.
export function Icon({ name, size = 20, color = 'currentColor', stroke = 1.7, fill = 'none', style }: IconProps) {
  const p = { fill, stroke: color, strokeWidth: stroke, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  const paths: Record<IconName, ReactNode> = {
    calendar: <><rect x="3" y="4.5" width="18" height="16.5" rx="2.5" {...p} /><path d="M3 9h18M8 2.5v4M16 2.5v4" {...p} /></>,
    clock: <><circle cx="12" cy="12" r="9" {...p} /><path d="M12 7.5V12l3.5 2" {...p} /></>,
    pin: <><path d="M12 21s7-5.5 7-11a7 7 0 10-14 0c0 5.5 7 11 7 11z" {...p} /><circle cx="12" cy="10" r="2.5" {...p} /></>,
    check: <path d="M4.5 12.5l5 5 10-11" {...p} />,
    bolt: <path d="M13 2L4.5 13.5H11L10 22l8.5-11.5H12L13 2z" fill={color} stroke={color} strokeWidth="0.5" strokeLinejoin="round" />,
    user: <><circle cx="12" cy="8" r="4" {...p} /><path d="M4.5 20.5c1.5-4 13.5-4 15 0" {...p} /></>,
    lock: <><rect x="4.5" y="10.5" width="15" height="10.5" rx="2.5" {...p} /><path d="M8 10.5V7a4 4 0 018 0v3.5" {...p} /></>,
    mail: <><rect x="3" y="5" width="18" height="14" rx="2.5" {...p} /><path d="M3.5 6.5l8.5 6 8.5-6" {...p} /></>,
    chevL: <path d="M14.5 5l-7 7 7 7" {...p} />,
    chevR: <path d="M9.5 5l7 7-7 7" {...p} />,
    arrowR: <path d="M4 12h15m-6-6l6 6-6 6" {...p} />,
    plus: <path d="M12 5v14M5 12h14" {...p} />,
    card: <><rect x="3" y="5" width="18" height="14" rx="2.5" {...p} /><path d="M3 9.5h18" {...p} /></>,
    x: <path d="M6 6l12 12M18 6L6 18" {...p} />,
    search: <><circle cx="11" cy="11" r="7" {...p} /><path d="M16 16l4.5 4.5" {...p} /></>,
    bell: <><path d="M6 9a6 6 0 0112 0c0 6 2 7 2 7H4s2-1 2-7z" {...p} /><path d="M10 20a2 2 0 004 0" {...p} /></>,
    indoor: <><rect x="4" y="4" width="16" height="16" rx="2" {...p} /><path d="M12 4v16M4 12h16" {...p} /></>,
    sun: <><circle cx="12" cy="12" r="4.5" {...p} /><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M5 5l1.8 1.8M17.2 17.2L19 19M19 5l-1.8 1.8M6.8 17.2L5 19" {...p} /></>,
    moon: <path d="M20 14.5A8 8 0 019.5 4 7 7 0 1020 14.5z" {...p} />,
    logout: <><path d="M15 4h2.5A2.5 2.5 0 0120 6.5v11a2.5 2.5 0 01-2.5 2.5H15" {...p} /><path d="M10 16.5L14.5 12 10 7.5M14.5 12H3.5" {...p} /></>,
    users: <><circle cx="9" cy="8" r="3.5" {...p} /><path d="M3 20c1-3.5 11-3.5 12 0M16 5a3.5 3.5 0 010 6.5M17 14c3 .5 4.5 2.5 4.5 4.5" {...p} /></>,
    euro: <><path d="M18 7.5A6.5 6.5 0 1018 16.5M5 10.5h8M5 13.5h7" {...p} /></>,
    grid: <><rect x="3.5" y="3.5" width="7" height="7" rx="1.5" {...p} /><rect x="13.5" y="3.5" width="7" height="7" rx="1.5" {...p} /><rect x="3.5" y="13.5" width="7" height="7" rx="1.5" {...p} /><rect x="13.5" y="13.5" width="7" height="7" rx="1.5" {...p} /></>,
    chart: <><path d="M4 20V4M4 20h16" {...p} /><path d="M8 16l4-5 3 3 4-7" {...p} /></>,
    ticket: <><path d="M3 8a2 2 0 012-2h14a2 2 0 012 2 2 2 0 000 4 2 2 0 000 4 2 2 0 01-2 2H5a2 2 0 01-2-2 2 2 0 000-4 2 2 0 000-4z" {...p} /><path d="M14 6v12" {...p} strokeDasharray="2 2.5" /></>,
    settings: <><circle cx="12" cy="12" r="3" {...p} /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9L17 7M7 17l-2.1 2.1" {...p} /></>,
    grip: <g fill={color} stroke="none"><circle cx="9" cy="6" r="1.5" /><circle cx="9" cy="12" r="1.5" /><circle cx="9" cy="18" r="1.5" /><circle cx="15" cy="6" r="1.5" /><circle cx="15" cy="12" r="1.5" /><circle cx="15" cy="18" r="1.5" /></g>,
    trophy: <><path d="M7 4h10v4a5 5 0 01-10 0V4z" {...p} /><path d="M7 5H4.5v2A3 3 0 007 9.8M17 5h2.5v2A3 3 0 0117 9.8M9 14h6M12 14v3M8.5 20h7M9.5 17h5l.5 3h-6z" {...p} /></>,
    eye: <><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" {...p} /><circle cx="12" cy="12" r="3" {...p} /></>,
    eyeOff: <><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" {...p} /><circle cx="12" cy="12" r="3" {...p} /><path d="M4 4l16 16" {...p} /></>,
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ display: 'block', flexShrink: 0, ...style }}>
      {paths[name] || null}
    </svg>
  );
}
