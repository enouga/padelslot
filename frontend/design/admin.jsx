// admin.jsx — SlotPadel club admin dashboard (desktop). Lives in a ChromeWindow.
// Floodlit (dark) theme. Has its own small live engine: the planning grid
// updates in real time and the activity feed grows.

const ADMIN_HOURS = Array.from({ length: 14 }, (_, i) => 8 + i); // 08:00–21:00

function adminSeedGrid() {
  const rnd = seeded('admin-' + 'club-demo');
  return COURTS.map((c) => ({
    court: c,
    cells: ADMIN_HOURS.map((h) => {
      const peak = (h >= 18 || (h >= 12 && h <= 13)) ? 0.7 : 0.32;
      const r = rnd();
      const status = r < peak ? 'booked' : (r < peak + 0.06 ? 'pending' : 'free');
      return { hour: h, status, who: status === 'free' ? null : PLAYERS[Math.floor(rnd() * PLAYERS.length)] };
    }),
  }));
}

function StatCard({ th, label, value, unit, delta, icon, big }) {
  return (
    <div style={{ flex: 1, background: th.surface, borderRadius: 18, padding: '18px 20px', boxShadow: `inset 0 0 0 1px ${th.line}` }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontFamily: th.fontUI, fontSize: 12.5, fontWeight: 600, letterSpacing: 0.3, textTransform: 'uppercase', color: th.textMute }}>{label}</span>
        <Icon name={icon} size={17} color={th.textFaint} />
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 12 }}>
        <span style={{ fontFamily: th.fontDisplay, fontWeight: 600, fontSize: 44, lineHeight: 0.9, color: big ? th.accent : th.text, letterSpacing: -1 }}>{value}</span>
        {unit && <span style={{ fontFamily: th.fontUI, fontSize: 16, color: th.textMute, fontWeight: 600 }}>{unit}</span>}
      </div>
      {delta && <div style={{ fontFamily: th.fontUI, fontSize: 12.5, color: th.textMute, marginTop: 6 }}>{delta}</div>}
    </div>
  );
}

function AdminDashboard({ accent, serif, neon }) {
  const th = React.useMemo(() => makeTheme('floodlit', { accent, serif, neon }), [accent, serif, neon]);
  const [board, setBoard] = React.useState(adminSeedGrid);
  const [feed, setFeed] = React.useState([
    { id: 1, who: 'Léa M.', court: 'Court Central', time: '19:00', kind: 'booked' },
    { id: 2, who: 'Karim B.', court: 'Court Jardin', time: '12:30', kind: 'booked' },
    { id: 3, who: 'Emma G.', court: 'Court Nord', time: '20:00', kind: 'cancelled' },
  ]);
  const [flash, setFlash] = React.useState(null);
  const fid = React.useRef(3);

  React.useEffect(() => {
    const t = setInterval(() => {
      setBoard((b) => {
        const ci = Math.floor(Math.random() * b.length);
        const hi = Math.floor(Math.random() * ADMIN_HOURS.length);
        const cell = b[ci].cells[hi];
        const becomeBooked = cell.status !== 'booked';
        const who = becomeBooked ? PLAYERS[Math.floor(Math.random() * PLAYERS.length)] : null;
        const nb = b.map((row, i) => i !== ci ? row : { ...row, cells: row.cells.map((c, j) => j !== hi ? c : { ...c, status: becomeBooked ? 'booked' : 'free', who }) });
        const time = `${pad(ADMIN_HOURS[hi])}:00`;
        setFlash(`${ci}-${hi}`); setTimeout(() => setFlash(null), 700);
        fid.current += 1;
        setFeed((f) => [{ id: fid.current, who: (who || cell.who || 'Joueur'), court: b[ci].court.name, time, kind: becomeBooked ? 'booked' : 'cancelled' }, ...f].slice(0, 7));
        return nb;
      });
    }, 2600);
    return () => clearInterval(t);
  }, []);

  const allCells = board.flatMap((r) => r.cells);
  const booked = allCells.filter((c) => c.status === 'booked').length;
  const fill = Math.round((booked / allCells.length) * 100);
  const revenue = board.reduce((sum, r) => sum + r.cells.filter((c) => c.status === 'booked').length * r.court.price, 0);

  const NAV = [['grid', 'Tableau de bord', true], ['calendar', 'Planning'], ['indoor', 'Terrains'], ['euro', 'Tarifs'], ['users', 'Clients'], ['settings', 'Réglages']];

  return (
    <div style={{ display: 'flex', height: '100%', background: th.bg, fontFamily: th.fontUI, color: th.text }}>
      {/* sidebar */}
      <div style={{ width: 212, flexShrink: 0, borderRight: `1px solid ${th.line}`, padding: '22px 16px', display: 'flex', flexDirection: 'column', background: th.bgElev }}>
        <div style={{ padding: '0 6px 22px' }}><Logotype th={th} size={21} /></div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {NAV.map(([ic, label, on]) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '10px 12px', borderRadius: 11, background: on ? th.surface2 : 'transparent', color: on ? th.text : th.textMute, cursor: 'pointer' }}>
              <Icon name={ic} size={18} color={on ? th.accent : th.textMute} />
              <span style={{ fontSize: 14, fontWeight: on ? 700 : 500 }}>{label}</span>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 'auto', padding: 12, borderRadius: 14, background: th.surface, boxShadow: `inset 0 0 0 1px ${th.line}` }}>
          <div style={{ fontSize: 11, color: th.textMute, textTransform: 'uppercase', letterSpacing: 0.4, fontWeight: 600 }}>Club</div>
          <div style={{ fontFamily: th.fontDisplay, fontWeight: 600, fontSize: 18, marginTop: 4, lineHeight: 1.1 }}>Padel Arena<br />Paris</div>
        </div>
      </div>

      {/* main */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '20px 26px', borderBottom: `1px solid ${th.line}` }}>
          <div>
            <div style={{ fontFamily: th.fontDisplay, fontWeight: 600, fontSize: 27, letterSpacing: -0.4, whiteSpace: 'nowrap' }}>Tableau de bord</div>
            <div style={{ fontSize: 13, color: th.textMute, marginTop: 2 }}>Samedi 31 mai 2026</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginLeft: 'auto', background: th.surface2, padding: '7px 12px', borderRadius: 20 }}>
            <LiveDot th={th} size={7} /><span style={{ fontFamily: th.fontMono, fontSize: 12 }}>Temps réel</span>
          </div>
          <div style={{ width: 38, height: 38, borderRadius: '50%', background: th.accent, color: th.onAccent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: th.fontDisplay, fontWeight: 600, fontSize: 16 }}>PA</div>
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 24 }}>
          <div style={{ display: 'flex', gap: 14 }}>
            <StatCard th={th} label="Remplissage" value={fill} unit="%" icon="chart" big delta="aujourd'hui · 14 h d'ouverture" />
            <StatCard th={th} label="Revenu du jour" value={`${revenue}`} unit="€" icon="euro" delta={`${booked} créneaux vendus`} />
            <StatCard th={th} label="Réservations" value={booked + 8} icon="ticket" delta="dont 8 ce matin" />
            <StatCard th={th} label="Joueurs en ligne" value={online_jitter()} icon="users" delta="sur l'app à l'instant" />
          </div>

          <div style={{ display: 'flex', gap: 16, marginTop: 20, alignItems: 'flex-start' }}>
            {/* planning grid */}
            <div style={{ flex: 1, minWidth: 0, background: th.surface, borderRadius: 18, padding: 18, boxShadow: `inset 0 0 0 1px ${th.line}` }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <span style={{ fontFamily: th.fontDisplay, fontWeight: 600, fontSize: 19 }}>Planning du jour</span>
                <div style={{ display: 'flex', gap: 14 }}>
                  {[['Réservé', th.accent], ['Bloqué', 'outline'], ['Libre', th.surface2]].map(([l, c]) => (
                    <span key={l} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: th.textMute }}>
                      <span style={{ width: 11, height: 11, borderRadius: 3, background: c === 'outline' ? 'transparent' : c, boxShadow: c === 'outline' ? `inset 0 0 0 1.4px ${th.accent}` : 'none' }} />{l}
                    </span>
                  ))}
                </div>
              </div>
              {/* column heads */}
              <div style={{ display: 'grid', gridTemplateColumns: '52px repeat(3, 1fr)', gap: 6, marginBottom: 6 }}>
                <div />
                {board.map((r) => (
                  <div key={r.court.id} style={{ textAlign: 'center', fontSize: 12.5, fontWeight: 700, color: th.text, paddingBottom: 2 }}>
                    {r.court.name}<div style={{ fontSize: 10.5, color: th.textMute, fontWeight: 500 }}>{r.court.price}€/h</div>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {ADMIN_HOURS.map((h, hi) => (
                  <div key={h} style={{ display: 'grid', gridTemplateColumns: '52px repeat(3, 1fr)', gap: 6 }}>
                    <div style={{ fontFamily: th.fontMono, fontSize: 11.5, color: th.textFaint, display: 'flex', alignItems: 'center' }}>{pad(h)}:00</div>
                    {board.map((r, ci) => {
                      const cell = r.cells[hi];
                      const isFlash = flash === `${ci}-${hi}`;
                      const booked = cell.status === 'booked', pend = cell.status === 'pending';
                      return (
                        <div key={r.court.id} style={{
                          height: 30, borderRadius: 8, display: 'flex', alignItems: 'center', padding: '0 9px', overflow: 'hidden',
                          background: booked ? th.accent : pend ? 'transparent' : th.surface2,
                          boxShadow: pend ? `inset 0 0 0 1.4px ${th.accent}` : 'none',
                          animation: isFlash ? 'sp-flip .7s ease' : 'none',
                        }}>
                          {booked && <span style={{ fontFamily: th.fontUI, fontSize: 11.5, fontWeight: 600, color: th.onAccent, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{cell.who}</span>}
                          {pend && <span style={{ fontFamily: th.fontUI, fontSize: 10.5, fontWeight: 600, color: th.accent }}>Bloqué</span>}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>

            {/* activity feed */}
            <div style={{ width: 286, flexShrink: 0, background: th.surface, borderRadius: 18, padding: 18, boxShadow: `inset 0 0 0 1px ${th.line}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                <LiveDot th={th} /><span style={{ fontFamily: th.fontDisplay, fontWeight: 600, fontSize: 19 }}>Activité en direct</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                {feed.map((f) => (
                  <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '9px 11px', borderRadius: 12, background: th.surface2, animation: 'sp-toast-in .35s ease' }}>
                    <span style={{ width: 30, height: 30, borderRadius: 8, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: f.kind === 'booked' ? th.accent : th.surfaceHi }}>
                      <Icon name={f.kind === 'booked' ? 'check' : 'x'} size={15} color={f.kind === 'booked' ? th.onAccent : th.textMute} stroke={2.2} />
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: th.text }}>{f.who}</div>
                      <div style={{ fontSize: 11.5, color: th.textMute }}>{f.kind === 'booked' ? 'a réservé' : 'a annulé'} · {f.court}</div>
                    </div>
                    <span style={{ fontFamily: th.fontMono, fontSize: 12, color: th.textFaint }}>{f.time}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function online_jitter() { return 30 + Math.floor(Math.random() * 20); }

Object.assign(window, { AdminDashboard });
