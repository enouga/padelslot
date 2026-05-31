// screens2.jsx — booking sheet, payment, ticket, reservations, profile.

const TOP2 = 58;

// ── BOOKING SHEET (over court detail) ───────────────────────
function ProgressRing({ th, frac, size = 132 }) {
  const r = (size - 12) / 2, C = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={th.surface2} strokeWidth="6" />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={th.accent} strokeWidth="6" strokeLinecap="round"
        strokeDasharray={C} strokeDashoffset={C * (1 - frac)} style={{ transition: 'stroke-dashoffset 1s linear' }} />
    </svg>
  );
}

function SummaryRows({ th, rows }) {
  return (
    <div style={{ background: th.surface2, borderRadius: 16, padding: '4px 16px' }}>
      {rows.map((r, i) => (
        <div key={r.k} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 0', borderTop: i ? `1px solid ${th.line}` : 'none' }}>
          <span style={{ fontFamily: th.fontUI, fontSize: 14, color: th.textMute }}>{r.k}</span>
          <span style={{ fontFamily: th.fontUI, fontSize: 14.5, fontWeight: 600, color: th.text }}>{r.v}</span>
        </div>
      ))}
    </div>
  );
}

function BookingSheet({ th, court, dayLabel, time, end, duration, amount, phase, secondsLeft, onPre, onConfirm, onCancel }) {
  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, '0');
  const ss = String(secondsLeft % 60).padStart(2, '0');
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 90, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
      <div onClick={onCancel} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(2px)', animation: 'sp-fade .25s ease' }} />
      <div style={{ position: 'relative', background: th.bgElev, borderRadius: '28px 28px 0 0', padding: '12px 20px 36px', boxShadow: '0 -10px 40px rgba(0,0,0,0.3)', animation: 'sp-sheet-in .34s cubic-bezier(.2,.8,.2,1)' }}>
        <div style={{ width: 38, height: 5, borderRadius: 3, background: th.lineStrong, margin: '0 auto 18px' }} />

        {phase === 'confirm' && (<>
          <div style={{ fontFamily: th.fontUI, fontSize: 12.5, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: th.textMute }}>{court.name}</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 6 }}>
            <span style={{ fontFamily: th.fontDisplay, fontWeight: 600, fontSize: 52, lineHeight: 1, color: th.text, letterSpacing: -1 }}>{amount}€</span>
            <span style={{ fontFamily: th.fontUI, fontSize: 14, color: th.textMute }}>{duration === 60 ? '1 heure' : duration === 90 ? '1 h 30' : '2 heures'} · {court.price}€/h</span>
          </div>
          <div style={{ marginTop: 18 }}>
            <SummaryRows th={th} rows={[{ k: 'Date', v: dayLabel }, { k: 'Horaire', v: `${time} → ${end}` }, { k: 'Joueurs', v: '4 · partie complète' }]} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '16px 2px', color: th.textMute }}>
            <Icon name="clock" size={15} color={th.textMute} />
            <span style={{ fontFamily: th.fontUI, fontSize: 12.5, lineHeight: 1.4 }}>Le créneau sera bloqué <b style={{ color: th.text }}>10 minutes</b> le temps de confirmer.</span>
          </div>
          <div style={{ display: 'flex', gap: 11 }}>
            <Btn th={th} variant="surface" onClick={onCancel} style={{ flex: '0 0 38%' }}>Annuler</Btn>
            <Btn th={th} onClick={onPre} icon="lock" style={{ flex: 1 }}>Pré-réserver</Btn>
          </div>
        </>)}

        {phase === 'pending' && (<>
          <div style={{ position: 'relative', width: 132, height: 132, margin: '6px auto 4px' }}>
            <ProgressRing th={th} frac={secondsLeft / 600} />
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontFamily: th.fontMono, fontWeight: 700, fontSize: 30, color: th.text, letterSpacing: -1 }}>{mm}:{ss}</span>
              <span style={{ fontFamily: th.fontUI, fontSize: 10.5, letterSpacing: 0.5, textTransform: 'uppercase', color: th.textMute, marginTop: 2 }}>restantes</span>
            </div>
          </div>
          <div style={{ textAlign: 'center', fontFamily: th.fontDisplay, fontWeight: 600, fontSize: 26, color: th.text, letterSpacing: -0.3 }}>Créneau bloqué pour vous</div>
          <div style={{ textAlign: 'center', fontFamily: th.fontUI, fontSize: 13.5, color: th.textMute, marginTop: 6 }}>{court.name} · {time} → {end} · {amount}€</div>
          <div style={{ display: 'flex', gap: 11, marginTop: 22 }}>
            <Btn th={th} variant="surface" onClick={onCancel} style={{ flex: '0 0 38%' }}>Abandonner</Btn>
            <Btn th={th} onClick={onConfirm} icon="arrowR" style={{ flex: 1 }}>Confirmer et payer</Btn>
          </div>
        </>)}
      </div>
    </div>
  );
}

// ── PAYMENT ─────────────────────────────────────────────────
function PaymentScreen({ th, court, dayLabel, time, end, amount, onBack, onPaid }) {
  const [num, setNum] = React.useState('4242 4242 4242 4242');
  const [exp, setExp] = React.useState('09 / 28');
  const [cvc, setCvc] = React.useState('•••');
  return (
    <div style={{ minHeight: '100%', background: th.bg, paddingBottom: 40 }}>
      <TopBar th={th} title="Paiement" onBack={onBack} />
      <div style={{ padding: '0 20px' }}>
        <div style={{ background: th.surface, borderRadius: 20, padding: 18, boxShadow: `inset 0 0 0 1px ${th.line}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontFamily: th.fontUI, fontWeight: 700, fontSize: 16, color: th.text }}>{court.name}</div>
              <div style={{ fontFamily: th.fontUI, fontSize: 13, color: th.textMute, marginTop: 3 }}>{dayLabel} · {time} → {end}</div>
            </div>
            <span style={{ fontFamily: th.fontDisplay, fontWeight: 600, fontSize: 30, color: th.text, lineHeight: 1 }}>{amount}€</span>
          </div>
        </div>

        <button onClick={onPaid} style={{ width: '100%', height: 54, marginTop: 18, border: 'none', borderRadius: 14, background: th.ink, color: th.mode === 'floodlit' ? th.text : '#f7f5ee', fontFamily: th.fontUI, fontWeight: 700, fontSize: 17, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <span style={{ fontSize: 20 }}></span> Pay
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '20px 0' }}>
          <div style={{ flex: 1, height: 1, background: th.line }} />
          <span style={{ fontFamily: th.fontUI, fontSize: 12, color: th.textFaint }}>ou par carte</span>
          <div style={{ flex: 1, height: 1, background: th.line }} />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
          <Field th={th} label="Numéro de carte" icon="card" value={num} onChange={setNum} />
          <div style={{ display: 'flex', gap: 13 }}>
            <div style={{ flex: 1 }}><Field th={th} label="Expiration" value={exp} onChange={setExp} /></div>
            <div style={{ flex: 1 }}><Field th={th} label="CVC" value={cvc} onChange={setCvc} /></div>
          </div>
        </div>
      </div>
      <div style={{ padding: '24px 20px 0' }}>
        <Btn th={th} full onClick={onPaid} icon="lock">Payer {amount}€</Btn>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 14, color: th.textFaint }}>
          <Icon name="lock" size={13} color={th.textFaint} />
          <span style={{ fontFamily: th.fontUI, fontSize: 12 }}>Paiement sécurisé · annulation gratuite jusqu'à 24 h</span>
        </div>
      </div>
    </div>
  );
}

// ── TICKET / CONFIRMATION ───────────────────────────────────
function QRish({ th, size = 130 }) {
  const cells = 19;
  const px = size / cells;
  const rnd = seeded('slotpadel-qr');
  const on = [];
  for (let y = 0; y < cells; y++) for (let x = 0; x < cells; x++) {
    const finder = (x < 7 && y < 7) || (x >= cells - 7 && y < 7) || (x < 7 && y >= cells - 7);
    on.push(finder ? ((x % 6 === 0 || y % 6 === 0) ? false : true) : rnd() > 0.55);
  }
  return (
    <div style={{ width: size, height: size, background: '#fff', borderRadius: 12, padding: 8, boxSizing: 'border-box' }}>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cells}, 1fr)`, width: '100%', height: '100%' }}>
        {on.map((v, i) => <div key={i} style={{ background: v ? '#15140f' : 'transparent' }} />)}
      </div>
    </div>
  );
}

function TicketScreen({ th, code, court, dayLabel, time, end, amount, onReservations }) {
  return (
    <div style={{ minHeight: '100%', background: th.bg, display: 'flex', flexDirection: 'column', padding: '0 20px 36px' }}>
      <div style={{ paddingTop: TOP2 + 24, textAlign: 'center' }}>
        <div style={{ width: 72, height: 72, borderRadius: '50%', background: th.accent, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center', animation: 'sp-pop .4s cubic-bezier(.2,1.4,.4,1)', boxShadow: th.neon ? `0 0 40px ${th.accent}55` : 'none' }}>
          <Icon name="check" size={36} color={th.onAccent} stroke={2.4} />
        </div>
        <div style={{ fontFamily: th.fontDisplay, fontWeight: 600, fontSize: 34, color: th.text, marginTop: 18, letterSpacing: -0.5 }}>Réservation confirmée</div>
        <div style={{ fontFamily: th.fontUI, fontSize: 14.5, color: th.textMute, marginTop: 6 }}>Un e-mail de confirmation vous attend.</div>
      </div>

      <div style={{ marginTop: 28, background: th.surface, borderRadius: 24, boxShadow: `${th.shadow}, inset 0 0 0 1px ${th.line}`, overflow: 'hidden' }}>
        <div style={{ padding: '24px 22px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
          <QRish th={th} />
          <span style={{ fontFamily: th.fontMono, fontWeight: 700, fontSize: 20, letterSpacing: 2, color: th.text }}>{code}</span>
        </div>
        <div style={{ borderTop: `2px dashed ${th.line}`, position: 'relative' }} />
        <div style={{ padding: '6px 22px 20px' }}>
          {[['Terrain', court.name], ['Date', dayLabel], ['Horaire', `${time} → ${end}`], ['Montant payé', `${amount}€`]].map(([k, v], i) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '13px 0', borderTop: i ? `1px solid ${th.line}` : 'none' }}>
              <span style={{ fontFamily: th.fontUI, fontSize: 14, color: th.textMute }}>{k}</span>
              <span style={{ fontFamily: th.fontUI, fontSize: 14.5, fontWeight: 600, color: th.text }}>{v}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 11, marginTop: 'auto', paddingTop: 24 }}>
        <Btn th={th} full variant="ghost" icon="calendar">Ajouter au calendrier</Btn>
        <Btn th={th} full onClick={onReservations} icon="ticket">Voir mes réservations</Btn>
      </div>
    </div>
  );
}

// ── MY RESERVATIONS ─────────────────────────────────────────
function ResCard({ th, r, upcoming }) {
  return (
    <div style={{ background: th.surface, borderRadius: 20, padding: 16, boxShadow: `inset 0 0 0 1px ${th.line}`, display: 'flex', gap: 14, opacity: upcoming ? 1 : 0.62 }}>
      <div style={{ width: 52, flexShrink: 0, textAlign: 'center', borderRight: `1px solid ${th.line}`, paddingRight: 14, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <span style={{ fontFamily: th.fontDisplay, fontWeight: 600, fontSize: 26, lineHeight: 1, color: th.text }}>{r.date.split(' ')[1]}</span>
        <span style={{ fontFamily: th.fontUI, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.4, color: th.textMute, marginTop: 3 }}>{r.date.split(' ')[2]}</span>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <span style={{ fontFamily: th.fontUI, fontWeight: 700, fontSize: 16, color: th.text }}>{r.court}</span>
          {upcoming ? <Chip th={th} tone="accent" icon="check">Confirmé</Chip> : <span style={{ fontFamily: th.fontUI, fontSize: 12, color: th.textFaint }}>Joué</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 9, fontFamily: th.fontUI, fontSize: 13, color: th.textMute }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><Icon name="clock" size={14} color={th.textMute} />{r.time}–{r.end}</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><Icon name="users" size={14} color={th.textMute} />{r.players}</span>
          <span style={{ fontFamily: th.fontMono, marginLeft: 'auto', color: th.textFaint }}>{r.id}</span>
        </div>
      </div>
    </div>
  );
}

function ReservationsScreen({ th, reservations }) {
  const [tab, setTab] = React.useState('upcoming');
  const up = reservations.filter((r) => r.status === 'confirmed');
  const past = reservations.filter((r) => r.status === 'played');
  const list = tab === 'upcoming' ? up : past;
  return (
    <div style={{ minHeight: '100%', background: th.bg, paddingBottom: 110 }}>
      <div style={{ padding: `${TOP2}px 20px 4px` }}>
        <div style={{ fontFamily: th.fontDisplay, fontWeight: 500, fontSize: 38, color: th.text, letterSpacing: -0.5 }}>Mes réservations</div>
      </div>
      <div style={{ padding: '16px 20px 0' }}>
        <Segmented th={th} value={tab} onChange={setTab} options={[{ value: 'upcoming', label: `À venir · ${up.length}` }, { value: 'past', label: `Passées · ${past.length}` }]} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 13, padding: '18px 20px 0' }}>
        {list.map((r) => <ResCard key={r.id} th={th} r={r} upcoming={tab === 'upcoming'} />)}
      </div>
    </div>
  );
}

// ── PROFILE ─────────────────────────────────────────────────
function ProfileScreen({ th, onLogout }) {
  const rows = [['user', 'Mes informations'], ['card', 'Moyens de paiement'], ['bell', 'Notifications'], ['settings', 'Préférences'], ['search', "Aide & contact"]];
  return (
    <div style={{ minHeight: '100%', background: th.bg, paddingBottom: 110 }}>
      <div style={{ padding: `${TOP2}px 20px 4px` }}>
        <div style={{ fontFamily: th.fontDisplay, fontWeight: 500, fontSize: 38, color: th.text, letterSpacing: -0.5 }}>Profil</div>
      </div>
      <div style={{ padding: '18px 20px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 15, background: th.surface, borderRadius: 20, padding: 16, boxShadow: `inset 0 0 0 1px ${th.line}` }}>
          <div style={{ width: 56, height: 56, borderRadius: '50%', background: th.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: th.fontDisplay, fontWeight: 600, fontSize: 24, color: th.onAccent }}>JD</div>
          <div>
            <div style={{ fontFamily: th.fontUI, fontWeight: 700, fontSize: 17, color: th.text }}>Julien Dubois</div>
            <div style={{ fontFamily: th.fontUI, fontSize: 13.5, color: th.textMute, marginTop: 2 }}>test@slotpadel.fr</div>
          </div>
          <div style={{ marginLeft: 'auto', textAlign: 'center' }}>
            <div style={{ fontFamily: th.fontDisplay, fontWeight: 600, fontSize: 26, color: th.accent, lineHeight: 1 }}>24</div>
            <div style={{ fontFamily: th.fontUI, fontSize: 10.5, color: th.textMute, textTransform: 'uppercase', letterSpacing: 0.4 }}>parties</div>
          </div>
        </div>
        <div style={{ marginTop: 16, background: th.surface, borderRadius: 20, overflow: 'hidden', boxShadow: `inset 0 0 0 1px ${th.line}` }}>
          {rows.map(([ic, label], i) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '15px 16px', borderTop: i ? `1px solid ${th.line}` : 'none' }}>
              <Icon name={ic} size={19} color={th.textMute} />
              <span style={{ flex: 1, fontFamily: th.fontUI, fontSize: 15.5, color: th.text }}>{label}</span>
              <Icon name="chevR" size={17} color={th.textFaint} />
            </div>
          ))}
        </div>
        <button onClick={onLogout} style={{ width: '100%', marginTop: 16, height: 50, border: `1.5px solid ${th.line}`, borderRadius: 14, background: 'transparent', color: th.textMute, fontFamily: th.fontUI, fontWeight: 600, fontSize: 15, cursor: 'pointer' }}>Se déconnecter</button>
      </div>
    </div>
  );
}

Object.assign(window, { BookingSheet, PaymentScreen, TicketScreen, ReservationsScreen, ProfileScreen, QRish });
