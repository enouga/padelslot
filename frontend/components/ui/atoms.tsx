'use client';

import { CSSProperties, ReactNode, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTheme } from '@/lib/ThemeProvider';
import { useAuth, logout } from '@/lib/useAuth';
import { useClub } from '@/lib/ClubProvider';
import { Icon, IconName } from './Icon';

// ── Logotype Palova : mark (balle monoligne, couleur marque) + wordmark
//    « palova » suivi de la petite balle apricot. Theme-aware (clair/sombre).
export function Logotype({ size = 26, color, href }: { size?: number; color?: string; href?: string }) {
  const { th } = useTheme();
  const { token, clubId, ready } = useAuth();
  const { slug } = useClub();
  const c = color || th.text;
  const ball = Math.max(3, Math.round(size * 0.16));
  // Destination contextuelle : sur un sous-domaine club, le logo ramène à la home du club (/).
  // Sinon (plateforme) : membre → back-office, joueur → annuaire, visiteur → accueil.
  const target = href ?? (slug ? '/' : (!ready ? '/' : clubId ? '/admin' : token ? '/clubs' : '/'));
  return (
    <Link href={target} aria-label="Accueil Palova" style={{ textDecoration: 'none', display: 'inline-flex' }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: size * 0.24, userSelect: 'none', cursor: 'pointer' }}>
        <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true" style={{ display: 'block', flexShrink: 0 }}>
          <g fill="none" stroke={th.accent} strokeWidth={6.5} strokeLinecap="round"
             style={{ filter: th.neon ? `drop-shadow(0 0 ${size * 0.18}px ${th.accent}66)` : 'none' }}>
            <circle cx="50" cy="50" r="37" />
            <path d="M20 30 Q50 50 20 70" />
            <path d="M80 30 Q50 50 80 70" />
          </g>
        </svg>
        <span style={{
          fontFamily: th.fontDisplay, fontWeight: 700, fontSize: size * 0.92, color: c,
          letterSpacing: -0.5, display: 'inline-flex', alignItems: 'baseline', lineHeight: 1,
        }}>
          palova
          <span style={{
            display: 'inline-block', width: ball, height: ball, borderRadius: '50%',
            background: th.accentWarm, marginLeft: size * 0.06,
          }} />
        </span>
      </span>
    </Link>
  );
}

type BtnVariant = 'primary' | 'dark' | 'ghost' | 'surface' | 'danger';

export function Btn({
  children, variant = 'primary', full, onClick, icon, style, disabled, type,
}: {
  children: ReactNode;
  variant?: BtnVariant;
  full?: boolean;
  onClick?: () => void;
  icon?: IconName;
  style?: CSSProperties;
  disabled?: boolean;
  type?: 'button' | 'submit';
}) {
  const { th } = useTheme();
  const base: CSSProperties = {
    fontFamily: th.fontUI, fontWeight: 600, fontSize: 16, letterSpacing: 0.1,
    border: 'none', borderRadius: 14, padding: '0 20px', height: 54, cursor: disabled ? 'default' : 'pointer',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 9,
    width: full ? '100%' : 'auto', transition: 'transform .12s, filter .15s, opacity .15s',
    opacity: disabled ? 0.45 : 1, WebkitTapHighlightColor: 'transparent', ...style,
  };
  const skins: Record<BtnVariant, CSSProperties> = {
    primary: { background: th.accent, color: th.onAccent, boxShadow: th.neon ? `0 6px 22px ${th.accent}33` : 'none' },
    dark: { background: th.ink, color: th.mode === 'floodlit' ? th.text : '#f7f5ee' },
    ghost: { background: 'transparent', color: th.text, boxShadow: `inset 0 0 0 1.5px ${th.lineStrong}` },
    surface: { background: th.surface2, color: th.text },
    danger: { background: '#ff7a4d', color: '#fff' },
  };
  const iconColor = variant === 'primary' ? th.onAccent : (skins[variant].color as string);
  return (
    <button type={type || 'button'} disabled={disabled} onClick={disabled ? undefined : onClick}
      onMouseDown={(e) => !disabled && (e.currentTarget.style.transform = 'scale(0.975)')}
      onMouseUp={(e) => (e.currentTarget.style.transform = '')}
      onMouseLeave={(e) => (e.currentTarget.style.transform = '')}
      style={{ ...base, ...skins[variant] }}>
      {icon && <Icon name={icon} size={19} color={iconColor} />}
      {children}
    </button>
  );
}

// Bouton retour — pilule discrète « ‹ Retour ». Va sur `href` si fourni,
// sinon revient à la page précédente (historique). Léger décalage au survol.
export function BackButton({ href, label = 'Retour' }: { href?: string; label?: string }) {
  const { th } = useTheme();
  const router = useRouter();
  const [hover, setHover] = useState(false);
  const go = () => (href ? router.push(href) : router.back());
  return (
    <button onClick={go} aria-label={label}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5, flexShrink: 0,
        height: 38, padding: '0 14px 0 10px', borderRadius: 999, border: 'none', cursor: 'pointer',
        background: th.surface2, color: th.text, fontFamily: th.fontUI, fontSize: 13.5, fontWeight: 600,
        transition: 'transform .14s, filter .15s', transform: hover ? 'translateX(-2px)' : 'none',
        filter: hover ? 'brightness(1.06)' : 'none', WebkitTapHighlightColor: 'transparent',
      }}>
      <Icon name="chevL" size={18} color={th.text} />{label}
    </button>
  );
}

type ChipTone = 'mute' | 'accent' | 'line';

export function Chip({ children, tone = 'mute', icon, color }: { children: ReactNode; tone?: ChipTone; icon?: IconName; color?: string }) {
  const { th } = useTheme();
  const tones: Record<ChipTone, { bg: string; fg: string; border?: string }> = {
    mute: { bg: th.surface2, fg: th.textMute },
    accent: { bg: th.mode === 'floodlit' ? `${th.accent}1f` : `${th.accent}55`, fg: th.mode === 'floodlit' ? th.accent : th.ink },
    line: { bg: 'transparent', fg: th.textMute, border: `1px solid ${th.line}` },
  };
  // `color` (hex) prime sur `tone` : pastille teintée de cette couleur (même logique que le ton accent).
  const t = color
    ? { bg: th.mode === 'floodlit' ? `${color}1f` : `${color}55`, fg: th.mode === 'floodlit' ? color : th.ink, border: undefined as string | undefined }
    : tones[tone];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5, fontFamily: th.fontUI, fontWeight: 600,
      fontSize: 12.5, letterSpacing: 0.2, color: t.fg, background: t.bg, border: t.border || 'none',
      padding: '5px 10px', borderRadius: 8, whiteSpace: 'nowrap',
    }}>
      {icon && <Icon name={icon} size={13} color={t.fg} />}{children}
    </span>
  );
}

export function LiveDot({ size = 8 }: { size?: number }) {
  const { th } = useTheme();
  return (
    <span style={{ position: 'relative', display: 'inline-flex', width: size, height: size }}>
      <span style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: th.accent, animation: 'sp-ping 1.8s cubic-bezier(0,0,0.2,1) infinite' }} />
      <span style={{ position: 'relative', width: size, height: size, borderRadius: '50%', background: th.accent }} />
    </span>
  );
}

export function Field({
  label, type = 'text', value, onChange, placeholder, icon, required, autoComplete,
}: {
  label: string;
  type?: string;
  value: string;
  onChange?: (v: string) => void;
  placeholder?: string;
  icon?: IconName;
  required?: boolean;
  autoComplete?: string;
}) {
  const { th } = useTheme();
  const [focus, setFocus] = useState(false);
  return (
    <label style={{ display: 'block' }}>
      <span style={{ fontFamily: th.fontUI, fontSize: 12.5, fontWeight: 600, letterSpacing: 0.4, textTransform: 'uppercase', color: th.textMute, display: 'block', marginBottom: 8 }}>{label}</span>
      <span style={{
        display: 'flex', alignItems: 'center', gap: 10, height: 54, padding: '0 16px', borderRadius: 14,
        background: th.surface, boxShadow: `inset 0 0 0 1.5px ${focus ? th.accent : th.line}`, transition: 'box-shadow .15s',
      }}>
        {icon && <Icon name={icon} size={18} color={focus ? th.accent : th.textFaint} />}
        <input type={type} value={value} placeholder={placeholder} required={required} autoComplete={autoComplete}
          onChange={(e) => onChange && onChange(e.target.value)}
          onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
          style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontFamily: th.fontUI, fontSize: 16, color: th.text, minWidth: 0 }} />
      </span>
    </label>
  );
}

interface SegOption<T> { value: T; label: string; }

export function Segmented<T extends string | number>({
  options, value, onChange,
}: { options: SegOption<T>[]; value: T; onChange: (v: T) => void }) {
  const { th } = useTheme();
  return (
    <div style={{ display: 'flex', gap: 4, background: th.surface2, borderRadius: 13, padding: 4 }}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button key={String(o.value)} onClick={() => onChange(o.value)}
            style={{
              flex: 1, border: 'none', cursor: 'pointer', borderRadius: 10, padding: '10px 6px',
              fontFamily: th.fontUI, fontWeight: 600, fontSize: 14.5,
              background: active ? th.surface : 'transparent',
              color: active ? th.text : th.textMute,
              boxShadow: active ? th.shadowSoft : 'none', transition: 'all .15s',
            }}>{o.label}</button>
        );
      })}
    </div>
  );
}

// Striped image placeholder (honest — no fake imagery).
export function Placeholder({ label, height = 150, radius = 18 }: { label: string; height?: number; radius?: number }) {
  const { th } = useTheme();
  const stripe = th.mode === 'floodlit' ? 'rgba(255,255,255,0.05)' : 'rgba(24,21,14,0.05)';
  return (
    <div style={{
      height, borderRadius: radius, background: th.surface2, position: 'relative', overflow: 'hidden',
      backgroundImage: `repeating-linear-gradient(135deg, ${stripe} 0 10px, transparent 10px 20px)`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <span style={{ fontFamily: th.fontMono, fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', color: th.textFaint }}>{label}</span>
    </div>
  );
}

// Barre de titre. `logoHref` affiche le logotype (lien d'accueil) à gauche ;
// sinon `onBack` affiche une flèche retour.
export function TopBar({ title, onBack, logoHref, right }: { title: ReactNode; onBack?: () => void; logoHref?: string; right?: ReactNode }) {
  const { th } = useTheme();
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '28px 16px 12px' }}>
      {logoHref ? (
        <Logotype href={logoHref} size={20} />
      ) : onBack ? (
        <button onClick={onBack} aria-label="Retour" style={{ border: 'none', cursor: 'pointer', width: 40, height: 40, borderRadius: 12, background: th.surface2, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Icon name="chevL" size={20} color={th.text} />
        </button>
      ) : null}
      <div style={{ flex: 1, fontFamily: th.fontUI, fontWeight: 700, fontSize: 17, color: th.text }}>{title}</div>
      {right}
    </div>
  );
}

// Accès « Mes réservations » — icône ticket, ne s'affiche que si connecté.
export function MyBookingsButton() {
  const { th } = useTheme();
  const { token, ready } = useAuth();
  if (!ready || !token) return null;
  return (
    <Link href="/me/reservations" aria-label="Mes réservations"
      style={{
        width: 38, height: 38, borderRadius: 12, flexShrink: 0, textDecoration: 'none',
        background: th.surface2, display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
      <Icon name="ticket" size={19} color={th.text} />
    </Link>
  );
}

// Bouton de déconnexion — ne s'affiche que si l'utilisateur est connecté.
export function LogoutButton() {
  const { th } = useTheme();
  const { token, ready } = useAuth();
  if (!ready || !token) return null;
  return (
    <button onClick={logout} aria-label="Se déconnecter"
      style={{
        width: 38, height: 38, borderRadius: 12, border: 'none', cursor: 'pointer', flexShrink: 0,
        background: th.surface2, display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
      <Icon name="logout" size={19} color={th.text} />
    </button>
  );
}

// Light/dark switch — sun in dark mode (tap for light), moon in light mode.
export function ThemeToggle() {
  const { th, mode, toggle } = useTheme();
  return (
    <button onClick={toggle} aria-label="Changer de thème"
      style={{
        width: 38, height: 38, borderRadius: 12, border: 'none', cursor: 'pointer', flexShrink: 0,
        background: th.surface2, display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
      <Icon name={mode === 'floodlit' ? 'sun' : 'moon'} size={19} color={th.text} />
    </button>
  );
}
