// ui.jsx — shared themed atoms for the SlotPadel mobile app.
// Every component takes a theme object `th` (from makeTheme).

// ── Logotype: serif wordmark with the accent ball standing in for the "o".
function Logotype({ th, size = 26, color }) {
  const c = color || th.text;
  const ball = Math.round(size * 0.56);
  return (
    <span style={{
      fontFamily: th.fontDisplay, fontWeight: 600, fontSize: size, color: c,
      letterSpacing: -0.5, display: 'inline-flex', alignItems: 'baseline', lineHeight: 1, userSelect: 'none',
    }}>
      Sl
      <span style={{
        display: 'inline-block', width: ball, height: ball, borderRadius: '50%',
        background: th.accent, margin: `0 ${size * 0.03}px`, transform: `translateY(${size * 0.04}px)`,
        boxShadow: th.neon ? `0 0 ${size * 0.5}px ${th.accent}55` : 'none',
      }} />
      tpadel
    </span>
  );
}

function Btn({ th, children, variant = 'primary', full, onClick, icon, style, disabled }) {
  const base = {
    fontFamily: th.fontUI, fontWeight: 600, fontSize: 16, letterSpacing: 0.1,
    border: 'none', borderRadius: 14, padding: '0 20px', height: 54, cursor: disabled ? 'default' : 'pointer',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 9,
    width: full ? '100%' : 'auto', transition: 'transform .12s, filter .15s, opacity .15s',
    opacity: disabled ? 0.45 : 1, WebkitTapHighlightColor: 'transparent', ...style,
  };
  const skins = {
    primary: { background: th.accent, color: th.onAccent, boxShadow: th.neon ? `0 6px 22px ${th.accent}33` : 'none' },
    dark: { background: th.ink, color: th.mode === 'floodlit' ? th.text : '#f7f5ee' },
    ghost: { background: 'transparent', color: th.text, boxShadow: `inset 0 0 0 1.5px ${th.lineStrong}` },
    surface: { background: th.surface2, color: th.text },
  };
  return (
    <button onClick={disabled ? undefined : onClick}
      onMouseDown={(e) => !disabled && (e.currentTarget.style.transform = 'scale(0.975)')}
      onMouseUp={(e) => (e.currentTarget.style.transform = '')}
      onMouseLeave={(e) => (e.currentTarget.style.transform = '')}
      style={{ ...base, ...skins[variant] }}>
      {icon && <Icon name={icon} size={19} color={variant === 'primary' ? th.onAccent : (skins[variant].color)} />}
      {children}
    </button>
  );
}

function Chip({ th, children, tone = 'mute', icon }) {
  const tones = {
    mute: { bg: th.surface2, fg: th.textMute },
    accent: { bg: th.mode === 'floodlit' ? `${th.accent}1f` : `${th.accent}55`, fg: th.mode === 'floodlit' ? th.accent : th.ink },
    line: { bg: 'transparent', fg: th.textMute, border: `1px solid ${th.line}` },
  };
  const t = tones[tone];
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

function LiveDot({ th, size = 8 }) {
  return (
    <span style={{ position: 'relative', display: 'inline-flex', width: size, height: size }}>
      <span style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: th.accent, animation: 'sp-ping 1.8s cubic-bezier(0,0,0.2,1) infinite' }} />
      <span style={{ position: 'relative', width: size, height: size, borderRadius: '50%', background: th.accent }} />
    </span>
  );
}

function Field({ th, label, type = 'text', value, onChange, placeholder, icon }) {
  const [focus, setFocus] = React.useState(false);
  return (
    <label style={{ display: 'block' }}>
      <span style={{ fontFamily: th.fontUI, fontSize: 12.5, fontWeight: 600, letterSpacing: 0.4, textTransform: 'uppercase', color: th.textMute, display: 'block', marginBottom: 8 }}>{label}</span>
      <span style={{
        display: 'flex', alignItems: 'center', gap: 10, height: 54, padding: '0 16px', borderRadius: 14,
        background: th.surface, boxShadow: `inset 0 0 0 1.5px ${focus ? th.accent : th.line}`, transition: 'box-shadow .15s',
      }}>
        {icon && <Icon name={icon} size={18} color={focus ? th.accent : th.textFaint} />}
        <input type={type} value={value} placeholder={placeholder}
          onChange={(e) => onChange && onChange(e.target.value)}
          onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
          style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontFamily: th.fontUI, fontSize: 16, color: th.text, minWidth: 0 }} />
      </span>
    </label>
  );
}

function Segmented({ th, options, value, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 4, background: th.surface2, borderRadius: 13, padding: 4 }}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button key={o.value} onClick={() => onChange(o.value)}
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

// Toast stack — rendered absolutely inside the device viewport.
function ToastStack({ th, toasts }) {
  return (
    <div style={{ position: 'absolute', top: 58, left: 14, right: 14, zIndex: 80, display: 'flex', flexDirection: 'column', gap: 8, pointerEvents: 'none' }}>
      {toasts.map((t) => (
        <div key={t.id} style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', borderRadius: 14,
          background: th.mode === 'floodlit' ? 'rgba(34,34,31,0.86)' : 'rgba(255,255,255,0.92)',
          backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)',
          boxShadow: th.shadow, border: `1px solid ${th.line}`,
          animation: 'sp-toast-in .32s cubic-bezier(.2,.8,.2,1)',
        }}>
          <span style={{ display: 'flex', width: 26, height: 26, borderRadius: 8, background: th.accent, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Icon name="bolt" size={15} color={th.onAccent} />
          </span>
          <span style={{ fontFamily: th.fontUI, fontSize: 13.5, color: th.text, lineHeight: 1.3 }}>{t.msg}</span>
        </div>
      ))}
    </div>
  );
}

function BottomNav({ th, active, onChange }) {
  const items = [
    { key: 'courts', label: 'Terrains', icon: 'grid' },
    { key: 'reservations', label: 'Réservations', icon: 'ticket' },
    { key: 'profile', label: 'Profil', icon: 'user' },
  ];
  return (
    <div style={{
      position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 40,
      paddingBottom: 26, paddingTop: 10,
      background: th.mode === 'floodlit' ? 'rgba(19,19,18,0.82)' : 'rgba(241,238,229,0.85)',
      backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)',
      borderTop: `1px solid ${th.line}`, display: 'flex',
    }}>
      {items.map((it) => {
        const on = it.key === active;
        return (
          <button key={it.key} onClick={() => onChange(it.key)}
            style={{ flex: 1, border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
            <Icon name={it.icon} size={23} color={on ? th.text : th.textFaint} stroke={on ? 2 : 1.7} />
            <span style={{ fontFamily: th.fontUI, fontSize: 10.5, fontWeight: on ? 700 : 500, letterSpacing: 0.2, color: on ? th.text : th.textFaint }}>{it.label}</span>
          </button>
        );
      })}
    </div>
  );
}

// Striped image placeholder (no fake imagery — honest placeholder).
function Placeholder({ th, label, height = 150, radius = 18 }) {
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

Object.assign(window, { Logotype, Btn, Chip, LiveDot, Field, Segmented, ToastStack, BottomNav, Placeholder });
