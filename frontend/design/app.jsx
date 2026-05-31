// app.jsx — SlotPadelApp: orchestrates screens, navigation, the live engine
// (slots flipping in real time, watcher counts, toasts) and the booking flow.
// Renders inside an <IOSDevice>. Props: th (theme), seed (string to vary the
// two instances so their live activity differs).

function SlotPadelApp({ th, seed = '' }) {
  const days = React.useMemo(() => dayPills(9), []);
  const [authed, setAuthed] = React.useState(true);
  const [tab, setTab] = React.useState('courts');
  const [view, setView] = React.useState('list');       // list | court | payment | ticket
  const [courtId, setCourtId] = React.useState('court-1');
  const [date, setDate] = React.useState(days[0].key);
  const [duration, setDuration] = React.useState(60);
  const [grids, setGrids] = React.useState({});
  const [selected, setSelected] = React.useState(null);  // slot object
  const [flashes, setFlashes] = React.useState(new Set());
  const [phase, setPhase] = React.useState(null);        // null | confirm | pending
  const [secs, setSecs] = React.useState(600);
  const [lastRes, setLastRes] = React.useState(null);
  const [myRes, setMyRes] = React.useState(MY_RESERVATIONS);
  const [toasts, setToasts] = React.useState([]);
  const [watching, setWatching] = React.useState(6);
  const [online, setOnline] = React.useState(38);
  const tid = React.useRef(0);

  const key = (cid) => `${cid}|${date}`;
  const ensure = React.useCallback((cid, d) => {
    const k = `${cid}|${d}`;
    setGrids((g) => g[k] ? g : { ...g, [k]: generateSlots(cid, d) });
  }, []);
  React.useEffect(() => { COURTS.forEach((c) => ensure(c.id, date)); }, [date, ensure]);

  const gridFor = (cid) => grids[key(cid)] || generateSlots(cid, date);
  const court = COURTS.find((c) => c.id === courtId);
  const slots = gridFor(courtId);

  const pushToast = React.useCallback((msg) => {
    const id = ++tid.current;
    setToasts((t) => [...t.slice(-1), { id, msg }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3600);
  }, []);

  const flash = React.useCallback((id) => {
    setFlashes((f) => new Set(f).add(id));
    setTimeout(() => setFlashes((f) => { const n = new Set(f); n.delete(id); return n; }), 650);
  }, []);

  // ── Live engine ──────────────────────────────────────────
  React.useEffect(() => {
    if (!authed) return;
    const t = setInterval(() => {
      setWatching((w) => Math.max(3, Math.min(13, w + (Math.random() < 0.5 ? -1 : 1))));
      setOnline((o) => Math.max(22, Math.min(64, o + (Math.random() < 0.5 ? -2 : 2))));
      const cid = COURTS[Math.floor(Math.random() * COURTS.length)].id;
      const k = `${cid}|${date}`;
      setGrids((g) => {
        const grid = (g[k] || generateSlots(cid, date)).slice();
        const candidates = grid.map((s, i) => [s, i]).filter(([s]) => s.status !== 'pending' && !(selected && s.id === selected.id));
        if (!candidates.length) return g;
        // bias toward bookings (free -> taken)
        const frees = candidates.filter(([s]) => s.status === 'free');
        const takens = candidates.filter(([s]) => s.status === 'taken');
        let pick, toStatus;
        if (frees.length && (Math.random() < 0.7 || !takens.length)) { pick = frees[Math.floor(Math.random() * frees.length)]; toStatus = 'taken'; }
        else if (takens.length) { pick = takens[Math.floor(Math.random() * takens.length)]; toStatus = 'free'; }
        else return g;
        grid[pick[1]] = { ...pick[0], status: toStatus };
        const cname = COURTS.find((c) => c.id === cid).name;
        if (toStatus === 'taken') pushToast(`${pick[0].time} réservé · ${cname}`);
        else pushToast(`Créneau libéré à ${pick[0].time} · ${cname}`);
        flash(pick[0].id);
        return { ...g, [k]: grid };
      });
    }, 3200);
    return () => clearInterval(t);
  }, [authed, date, selected, pushToast, flash]);

  // ── Countdown ────────────────────────────────────────────
  React.useEffect(() => {
    if (phase !== 'pending') return;
    if (secs <= 0) { releaseSelected(); pushToast('Pré-réservation expirée'); return; }
    const t = setTimeout(() => setSecs((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [phase, secs]);

  const setSlotStatus = (cid, slotId, status) => setGrids((g) => {
    const k = `${cid}|${date}`; const grid = (g[k] || []).slice();
    const i = grid.findIndex((s) => s.id === slotId); if (i < 0) return g;
    grid[i] = { ...grid[i], status }; return { ...g, [k]: grid };
  });

  const releaseSelected = () => {
    if (selected) setSlotStatus(courtId, selected.id, 'free');
    setSelected(null); setPhase(null);
  };

  // ── Booking actions ──────────────────────────────────────
  const onSelect = (slot) => { if (slot.status !== 'free') return; setSelected(slot); setPhase('confirm'); };
  const onPre = () => { setSlotStatus(courtId, selected.id, 'pending'); setSecs(600); setPhase('pending'); };
  const onConfirm = () => { setPhase(null); setView('payment'); };
  const onCancel = () => { releaseSelected(); };
  const onPaid = () => {
    setSlotStatus(courtId, selected.id, 'taken');
    const d = days.find((x) => x.key === date);
    const code = resCode();
    const res = { id: code, court: court.name, surface: court.surface, date: `${d.dow.charAt(0).toUpperCase() + d.dow.slice(1)} ${d.day} ${d.mon}`, time: selected.time, end: endTime(selected.time, duration), price: total(court.price, duration), status: 'confirmed', players: 4 };
    setLastRes({ ...res, code, dayLabel: d.label, amount: total(court.price, duration) });
    setMyRes((m) => [res, ...m]);
    setSelected(null); setView('ticket');
  };

  const dLabel = (days.find((x) => x.key === date) || {}).label || '';
  const amount = total(court.price, duration);
  const showNav = authed && (view === 'list' || tab !== 'courts');

  let content;
  if (!authed) content = <LoginScreen th={th} onAuth={() => setAuthed(true)} />;
  else if (tab === 'reservations') content = <ReservationsScreen th={th} reservations={myRes} />;
  else if (tab === 'profile') content = <ProfileScreen th={th} onLogout={() => { setAuthed(false); setTab('courts'); setView('list'); }} />;
  else if (view === 'court') content = (
    <CourtScreen th={th} court={court} days={days} date={date} setDate={(d) => { setDate(d); setSelected(null); setPhase(null); }}
      duration={duration} setDuration={setDuration} slots={slots} selectedId={selected && selected.id} flashes={flashes}
      watching={watching} onSelect={onSelect} onBack={() => { releaseSelected(); setView('list'); }} />
  );
  else if (view === 'payment') content = (
    <PaymentScreen th={th} court={court} dayLabel={dLabel} time={selected ? selected.time : ''} end={selected ? endTime(selected.time, duration) : ''} amount={amount}
      onBack={() => { setView('court'); setPhase('pending'); }} onPaid={onPaid} />
  );
  else if (view === 'ticket' && lastRes) content = (
    <TicketScreen th={th} code={lastRes.code} court={{ name: lastRes.court }} dayLabel={lastRes.dayLabel} time={lastRes.time} end={lastRes.end} amount={lastRes.amount}
      onReservations={() => { setView('list'); setTab('reservations'); setLastRes(null); }} />
  );
  else content = <CourtsScreen th={th} courts={COURTS} online={online} gridFor={gridFor} onOpen={(id) => { setCourtId(id); setView('court'); }} />;

  return (
    <div style={{ position: 'relative', height: '100%', overflow: 'hidden', background: th.bg }}>
      <div style={{ position: 'absolute', inset: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>{content}</div>
      {authed && <ToastStack th={th} toasts={toasts} />}
      {phase && view === 'court' && (
        <BookingSheet th={th} court={court} dayLabel={dLabel} time={selected.time} end={endTime(selected.time, duration)} duration={duration}
          amount={amount} phase={phase} secondsLeft={secs} onPre={onPre} onConfirm={onConfirm} onCancel={onCancel} />
      )}
      {showNav && <BottomNav th={th} active={tab} onChange={(t) => { setTab(t); setView('list'); }} />}
    </div>
  );
}

Object.assign(window, { SlotPadelApp });
