// screens.jsx — SlotPadel mobile screens. Globals: Icon, Btn, Chip, LiveDot,
// Field, Segmented, BottomNav, Placeholder, Logotype + data helpers.

// Top safe-area inset (status bar + dynamic island).
const TOP = 58;

function TopBar({ th, title, onBack, right }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: `${TOP}px 16px 12px` }}>
      {onBack && (
        <button onClick={onBack} style={{ border: 'none', cursor: 'pointer', width: 40, height: 40, borderRadius: 12, background: th.surface2, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Icon name="chevL" size={20} color={th.text} />
        </button>
      )}
      <div style={{ flex: 1, fontFamily: th.fontUI, fontWeight: 700, fontSize: 17, color: th.text }}>{title}</div>
      {right}
    </div>
  );
}

// ── LOGIN ───────────────────────────────────────────────────
function LoginScreen({ th, onAuth }) {
  const [email, setEmail] = React.useState('test@slotpadel.fr');
  const [pw, setPw] = React.useState('••••••••');
  const [mode, setMode] = React.useState('login');
  return (
    <div style={{ minHeight: '100%', display: 'flex', flexDirection: 'column', padding: '0 24px 40px', background: th.bg }}>
      <div style={{ paddingTop: TOP + 56, paddingBottom: 40 }}>
        <Logotype th={th} size={34} />
        <div style={{ fontFamily: th.fontDisplay, fontWeight: 500, fontSize: 46, lineHeight: 1.04, color: th.text, marginTop: 36, letterSpacing: -0.5 }}>
          Réservez votre<br />terrain en<br /><span style={{ fontStyle: 'italic' }}>quelques</span> secondes.
        </div>
        <div style={{ fontFamily: th.fontUI, fontSize: 15.5, color: th.textMute, marginTop: 16, lineHeight: 1.5, maxWidth: 300 }}>
          Disponibilités en direct, créneaux bloqués 10 minutes le temps de confirmer.
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 'auto' }}>
        <Field th={th} label="Adresse e-mail" icon="mail" value={email} onChange={setEmail} />
        <Field th={th} label="Mot de passe" icon="lock" type="password" value={pw} onChange={setPw} />
        <div style={{ height: 4 }} />
        <Btn th={th} full onClick={onAuth} icon="arrowR">{mode === 'login' ? 'Se connecter' : 'Créer mon compte'}</Btn>
        <button onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}
          style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: th.fontUI, fontSize: 14.5, color: th.textMute, padding: '6px 0' }}>
          {mode === 'login' ? "Pas encore de compte ? " : 'Déjà inscrit ? '}
          <span style={{ color: th.text, fontWeight: 700, textDecoration: 'underline', textUnderlineOffset: 3 }}>{mode === 'login' ? 'Créer un compte' : 'Se connecter'}</span>
        </button>
      </div>
    </div>
  );
}

// ── COURTS LIST ─────────────────────────────────────────────
function CourtCard({ th, court, freeCount, nextFree, onOpen }) {
  return (
    <button onClick={onOpen} style={{
      border: 'none', cursor: 'pointer', textAlign: 'left', width: '100%', padding: 0,
      background: th.surface, borderRadius: 22, overflow: 'hidden',
      display: 'block', boxShadow: `${th.shadowSoft}, inset 0 0 0 1px ${th.line}`,
    }}>
      <div style={{ position: 'relative' }}>
        <Placeholder th={th} label={`photo · ${court.name}`} height={116} radius={0} />
        <div style={{ position: 'absolute', top: 12, left: 12, display: 'flex', gap: 6 }}>
          <Chip th={th} tone="accent" icon={court.surface === 'indoor' ? 'indoor' : 'sun'}>{court.surface === 'indoor' ? 'Indoor' : 'Plein air'}</Chip>
          {court.popular && <Chip th={th} tone="line">Populaire</Chip>}
        </div>
      </div>
      <div style={{ padding: '15px 16px 17px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <div style={{ fontFamily: th.fontDisplay, fontWeight: 600, fontSize: 25, color: th.text, lineHeight: 1, letterSpacing: -0.3 }}>{court.name}</div>
            <div style={{ fontFamily: th.fontUI, fontSize: 13, color: th.textMute, marginTop: 5 }}>{court.note}</div>
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div style={{ fontFamily: th.fontDisplay, fontWeight: 600, fontSize: 26, color: th.text, lineHeight: 1 }}>{court.price}€<span style={{ fontFamily: th.fontUI, fontSize: 12, color: th.textMute, fontWeight: 500 }}> /h</span></div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14, paddingTop: 14, borderTop: `1px solid ${th.line}` }}>
          <LiveDot th={th} />
          <span style={{ fontFamily: th.fontUI, fontSize: 13.5, color: th.text, fontWeight: 600 }}>{freeCount} créneaux libres</span>
          <span style={{ fontFamily: th.fontUI, fontSize: 13.5, color: th.textMute }}>· dès {nextFree}</span>
          <Icon name="chevR" size={17} color={th.textFaint} style={{ marginLeft: 'auto' }} />
        </div>
      </div>
    </button>
  );
}

function CourtsScreen({ th, courts, online, gridFor, onOpen }) {
  return (
    <div style={{ minHeight: '100%', background: th.bg, paddingBottom: 110 }}>
      <div style={{ padding: `${TOP}px 20px 6px` }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Logotype th={th} size={22} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, background: th.surface2, padding: '6px 11px', borderRadius: 20 }}>
            <LiveDot th={th} size={7} />
            <span style={{ fontFamily: th.fontMono, fontSize: 12, color: th.text }}>{online} en ligne</span>
          </div>
        </div>
        <div style={{ marginTop: 24 }}>
          <div style={{ fontFamily: th.fontUI, fontSize: 13, fontWeight: 600, letterSpacing: 0.4, textTransform: 'uppercase', color: th.textMute, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Icon name="pin" size={14} color={th.textMute} />{CLUB.name}
          </div>
          <div style={{ fontFamily: th.fontDisplay, fontWeight: 500, fontSize: 40, lineHeight: 1.05, color: th.text, marginTop: 8, letterSpacing: -0.5 }}>
            Choisissez<br />votre terrain.
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '20px 20px 0' }}>
        {courts.map((c) => {
          const g = gridFor(c.id);
          const free = g.filter((s) => s.status === 'free');
          return <CourtCard key={c.id} th={th} court={c} freeCount={free.length} nextFree={free[0] ? free[0].time : '—'} onOpen={() => onOpen(c.id)} />;
        })}
      </div>
    </div>
  );
}

// ── COURT DETAIL + LIVE CALENDAR ────────────────────────────
function SlotCell({ th, slot, selected, flash, onClick }) {
  const taken = slot.status === 'taken';
  const mine = slot.status === 'pending';
  let bg = th.surface2, fg = th.text, sub = 'Libre', subColor = th.textMute, ring = 'none';
  if (taken) { bg = th.takenBg; fg = th.takenText; sub = 'Réservé'; subColor = th.takenText; }
  if (selected) { bg = th.accent; fg = th.onAccent; sub = 'Sélection'; subColor = th.onAccent; }
  if (mine) { bg = 'transparent'; ring = `inset 0 0 0 1.6px ${th.accent}`; fg = th.text; sub = 'Bloqué'; subColor = th.accent; }
  return (
    <button onClick={() => !taken && onClick()} disabled={taken}
      style={{
        border: 'none', cursor: taken ? 'default' : 'pointer', borderRadius: 13, padding: '11px 6px',
        background: bg, boxShadow: ring, position: 'relative', overflow: 'hidden',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
        animation: flash ? 'sp-flip .6s ease' : 'none', transition: 'background .2s',
      }}>
      <span style={{ fontFamily: th.fontMono, fontWeight: 500, fontSize: 15, color: fg, letterSpacing: -0.3, textDecoration: taken ? `line-through ${th.takenText}` : 'none' }}>{slot.time}</span>
      <span style={{ fontFamily: th.fontUI, fontWeight: 600, fontSize: 10.5, letterSpacing: 0.3, textTransform: 'uppercase', color: subColor }}>{sub}</span>
    </button>
  );
}

function CourtScreen({ th, court, days, date, setDate, duration, setDuration, slots, selectedId, flashes, watching, onSelect, onBack }) {
  const free = slots.filter((s) => s.status === 'free').length;
  return (
    <div style={{ minHeight: '100%', background: th.bg, paddingBottom: 30 }}>
      <TopBar th={th} title={court.name} onBack={onBack} right={<Chip th={th} tone="accent" icon={court.surface === 'indoor' ? 'indoor' : 'sun'}>{court.surface === 'indoor' ? 'Indoor' : 'Plein air'}</Chip>} />
      <div style={{ padding: '0 16px' }}>
        <Placeholder th={th} label={`photo · ${court.name}`} height={132} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <LiveDot th={th} />
            <span style={{ fontFamily: th.fontUI, fontSize: 13.5, color: th.text }}><b style={{ fontWeight: 700 }}>{watching}</b> personnes regardent</span>
          </div>
          <span style={{ fontFamily: th.fontMono, fontSize: 12, color: th.textFaint }}>maj. en direct</span>
        </div>
      </div>

      {/* day pills */}
      <div style={{ display: 'flex', gap: 9, overflowX: 'auto', padding: '18px 16px 4px', scrollbarWidth: 'none' }}>
        {days.map((d) => {
          const on = d.key === date;
          return (
            <button key={d.key} onClick={() => setDate(d.key)} style={{
              border: 'none', cursor: 'pointer', flexShrink: 0, width: 58, padding: '11px 0', borderRadius: 16,
              background: on ? th.ink : th.surface2, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
            }}>
              <span style={{ fontFamily: th.fontUI, fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4, color: on ? (th.mode === 'floodlit' ? th.textMute : '#cfccc0') : th.textMute }}>{d.dow}</span>
              <span style={{ fontFamily: th.fontDisplay, fontSize: 24, fontWeight: 600, lineHeight: 1, color: on ? (th.mode === 'floodlit' ? th.text : '#f7f5ee') : th.text }}>{d.day}</span>
            </button>
          );
        })}
      </div>

      <div style={{ padding: '16px 16px 0' }}>
        <Segmented th={th} value={duration} onChange={setDuration} options={[{ value: 60, label: '1 h' }, { value: 90, label: '1 h 30' }, { value: 120, label: '2 h' }]} />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 16px 12px' }}>
        <span style={{ fontFamily: th.fontUI, fontWeight: 700, fontSize: 14, color: th.text }}>Créneaux <span style={{ color: th.textMute, fontWeight: 500 }}>· {free} libres</span></span>
        <div style={{ display: 'flex', gap: 14 }}>
          {[['Libre', th.surface2], ['Réservé', th.takenBg]].map(([l, c]) => (
            <span key={l} style={{ display: 'flex', alignItems: 'center', gap: 5, fontFamily: th.fontUI, fontSize: 11.5, color: th.textMute }}>
              <span style={{ width: 11, height: 11, borderRadius: 4, background: c }} />{l}
            </span>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 9, padding: '0 16px' }}>
        {slots.map((s) => (
          <SlotCell key={s.id} th={th} slot={s} selected={s.id === selectedId} flash={flashes.has(s.id)} onClick={() => onSelect(s)} />
        ))}
      </div>
    </div>
  );
}

Object.assign(window, { TopBar, LoginScreen, CourtsScreen, CourtCard, CourtScreen, SlotCell, TOP });
