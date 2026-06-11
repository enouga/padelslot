'use client';
import { useState, useEffect, useCallback, useRef, CSSProperties } from 'react';
import { api, AdminResource, ClubReservation, ReservationType, PaymentMethod, Member, MemberPackage } from '@/lib/api';
import { packageLabel, isUsable, canCover } from '@/lib/packages';
import { courtFormat, SINGLE_COLOR } from '@/lib/courtType';
import { useAuth } from '@/lib/useAuth';
import { useClub } from '@/lib/ClubProvider';
import { useTheme } from '@/lib/ThemeProvider';
import { useAdminChrome } from '../layout';
import { Btn } from '@/components/ui/atoms';

const TYPE_META: Record<ReservationType, { label: string; color: string }> = {
  COURT:      { label: 'Terrain',   color: '#5e93da' },
  COACHING:   { label: 'Coaching',  color: '#34b888' },
  TOURNAMENT: { label: 'Tournoi',   color: '#f0913c' },
  EVENT:      { label: 'Événement', color: '#a98bf0' },
};
const TYPE_ORDER: ReservationType[] = ['COURT', 'COACHING', 'TOURNAMENT', 'EVENT'];
// Méthodes proposées dans le select d'encaissement (les prépayés ont des boutons dédiés).
const METHOD_LABEL: Record<string, string> = { CASH: 'Espèces', CARD: 'Carte', TRANSFER: 'Virement', ONLINE: 'En ligne', VOUCHER: 'Ticket CE', OTHER: 'Autre' };
const STATUS_LABEL: Record<string, string> = { PENDING: 'En attente', CONFIRMED: 'Confirmée', CANCELLED: 'Annulée' };
// Dimensions de la grille verticale (terrains en colonnes, heures en lignes).
const HOUR_H = 68, TIME_W = 56, COL_MIN_W = 120, HEADER_H = 52;

function todayISO(): string { return new Date().toISOString().slice(0, 10); }

function shiftDate(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

function fmtDay(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d)));
}

// Minutes locales (fuseau du club) depuis minuit pour un instant ISO.
function localMinutes(iso: string, tz: string): number {
  const f = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: tz }).format(new Date(iso));
  const [h, m] = f.split(':').map(Number);
  return h * 60 + m;
}

function nowMinutes(tz: string): number {
  const f = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: tz }).format(new Date());
  const [h, m] = f.split(':').map(Number);
  return h * 60 + m;
}

function fmtHM(iso: string, tz: string): string {
  return new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: tz }).format(new Date(iso)).replace(':', 'h');
}

export default function AdminPlanningPage() {
  const { th } = useTheme();
  const { token, ready } = useAuth();
  const { club } = useClub();
  const { collapsed, setCollapsed } = useAdminChrome();
  const clubId = club?.id;
  // Étiquette d'une entrée : l'intitulé s'il existe, sinon le nom du joueur, sinon « Événement ».
  const labelOf = (r: ClubReservation) =>
    r.title?.trim()
      ? r.title
      : r.user
        ? `${r.user.firstName} ${r.user.lastName}`
        : 'Événement';
  const rootRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  const [tz, setTz]               = useState('Europe/Paris');
  const [resources, setResources] = useState<AdminResource[]>([]);
  const [reservations, setRes]    = useState<ClubReservation[]>([]);
  const [date, setDate]           = useState(todayISO());
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [hidden, setHidden]       = useState<Set<ReservationType>>(new Set());
  const [selected, setSelected]   = useState<ClubReservation | null>(null);
  const [payForm, setPayForm]     = useState<{ amount: string; method: PaymentMethod }>({ amount: '', method: 'CASH' });
  const [voucherRef, setVoucherRef]       = useState('');
  const [voucherIssuer, setVoucherIssuer] = useState('');
  const [selPackages, setSelPackages]     = useState<MemberPackage[]>([]);
  const [busy, setBusy]           = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [isFs, setIsFs]           = useState(false);

  const [members, setMembers]   = useState<Member[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [cType, setCType]       = useState<ReservationType>('EVENT');
  const [cResourceId, setCResId] = useState('');
  const [cDate, setCDate]       = useState(date);
  const [cStart, setCStart]     = useState('18:00');
  const [cEnd, setCEnd]         = useState('19:00');
  const [cTitle, setCTitle]     = useState('');
  const [cMemberId, setCMemberId] = useState<string | null>(null);
  const [cMemberQuery, setCMemberQuery] = useState('');
  const [cPrice, setCPrice]     = useState('');

  const load = useCallback(async () => {
    if (!token || !clubId) return;
    setLoading(true);
    try {
      setError(null);
      const [c, res, resv, mem] = await Promise.all([
        api.adminGetClub(clubId, token),
        api.adminGetResources(clubId, token),
        api.adminGetReservations(clubId, { date }, token),
        api.adminGetMembers(clubId, token),
      ]);
      setTz(c.timezone);
      setResources(res.filter((r) => r.isActive));
      setRes(resv.reservations);
      setMembers(mem);
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }, [token, clubId, date]);

  useEffect(() => { if (ready && token && clubId) load(); }, [ready, token, clubId, load]);

  // Rétablit la barre latérale en quittant la page.
  useEffect(() => () => setCollapsed(false), [setCollapsed]);

  // Suivi de l'état plein écran.
  useEffect(() => {
    const onFs = () => setIsFs(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  const toggleFs = () => {
    if (document.fullscreenElement) { document.exitFullscreen(); return; }
    rootRef.current?.requestFullscreen?.();
  };

  const minOpen = resources.length ? Math.min(...resources.map((r) => r.openHour)) : 8;
  const maxClose = resources.length ? Math.max(...resources.map((r) => r.closeHour)) : 22;
  const hours: number[] = [];
  for (let h = minOpen; h < maxClose; h++) hours.push(h);

  const shown = reservations.filter((rv) => rv.status !== 'CANCELLED' && !hidden.has(rv.type));

  // Réservations visibles regroupées par terrain.
  const byResource = new Map<string, ClubReservation[]>();
  for (const rv of shown) {
    const arr = byResource.get(rv.resource.id) ?? [];
    arr.push(rv);
    byResource.set(rv.resource.id, arr);
  }

  // Stats (sur les réservations affichées).
  let openMin = 0, bookedMin = 0, outstanding = 0;
  for (const r of resources) openMin += (r.closeHour - r.openHour) * 60;
  for (const rv of shown) {
    const r = resources.find((x) => x.id === rv.resource.id);
    if (r) {
      const s = Math.max(localMinutes(rv.startTime, tz), r.openHour * 60);
      const e = Math.min(localMinutes(rv.endTime, tz), r.closeHour * 60);
      if (e > s) bookedMin += e - s;
    }
    outstanding += Math.max(0, Number(rv.totalPrice) - Number(rv.paidAmount));
  }
  const occupancy = openMin > 0 ? Math.round((bookedMin / openMin) * 100) : 0;

  const nm = nowMinutes(tz);
  const nowVisible = date === todayISO() && resources.length > 0 && nm >= minOpen * 60 && nm <= maxClose * 60;
  const nowTop = ((nm - minOpen * 60) / 60) * HOUR_H;

  // Le jour J, ouvre la grille positionnée un peu au-dessus de l'heure courante.
  useEffect(() => {
    if (loading || date !== todayISO() || !gridRef.current) return;
    gridRef.current.scrollTop = Math.max(0, ((nowMinutes(tz) - minOpen * 60) / 60) * HOUR_H - 2 * HOUR_H);
  }, [loading, date, tz, minOpen]);

  const tint = (hex: string) => (th.mode === 'floodlit' ? `${hex}2e` : `${hex}24`);
  const hatch = `repeating-linear-gradient(135deg, ${th.line} 0 5px, transparent 5px 11px)`;

  const arrow: CSSProperties = {
    width: 34, height: 34, borderRadius: 10, border: `1px solid ${th.line}`, background: 'transparent',
    color: th.textMute, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, lineHeight: 1, flexShrink: 0,
  };
  const chromeBtn: CSSProperties = {
    border: `1px solid ${th.line}`, background: th.surface, color: th.text, borderRadius: 10, padding: '8px 12px',
    cursor: 'pointer', fontFamily: th.fontUI, fontSize: 12.5, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6,
  };

  const stat = (label: string, value: string) => (
    <div>
      <div style={{ fontFamily: th.fontMono, fontSize: 10, fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase', color: th.textFaint }}>{label}</div>
      <div style={{ fontFamily: th.fontDisplay, fontSize: 19, fontWeight: 600, color: th.text }}>{value}</div>
    </div>
  );

  // --- Actions modale ---
  const openRes = (rv: ClubReservation) => {
    setSelected(rv);
    setConfirmCancel(false);
    const remaining = Math.max(0, Number(rv.totalPrice) - Number(rv.paidAmount));
    setPayForm({ amount: remaining ? String(remaining) : '', method: 'CASH' });
    setVoucherRef(''); setVoucherIssuer('');
    setSelPackages([]);
    if (rv.user && token && clubId) {
      api.adminGetMemberPackages(clubId, rv.user.id, token)
        .then((pkgs) => setSelPackages(pkgs.filter((p) => isUsable(p))))
        .catch(() => setSelPackages([]));
    }
  };

  const changeType = async (t: ReservationType) => {
    if (!token || !clubId || !selected) return;
    setBusy(true);
    try { setError(null); await api.adminSetReservationType(clubId, selected.id, t, token); setSelected({ ...selected, type: t }); await load(); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };

  const doCancel = async () => {
    if (!token || !clubId || !selected) return;
    setBusy(true);
    try { setError(null); await api.adminCancelReservation(clubId, selected.id, token); setSelected(null); await load(); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };

  const addPayment = async () => {
    if (!token || !clubId || !selected) return;
    const amount = Number(payForm.amount);
    if (!amount || amount <= 0) { setError('Montant invalide.'); return; }
    if (payForm.method === 'VOUCHER' && !voucherRef.trim()) { setError('Référence du ticket CE requise.'); return; }
    setBusy(true);
    try {
      setError(null);
      await api.adminAddPayment(clubId, selected.id, {
        amount, method: payForm.method,
        voucherRef: payForm.method === 'VOUCHER' ? voucherRef.trim() : undefined,
        voucherIssuer: payForm.method === 'VOUCHER' ? voucherIssuer.trim() || undefined : undefined,
      }, token);
      setSelected(null); await load();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };

  // Solde la résa avec un package du joueur (1 entrée de carnet, ou débit du porte-monnaie).
  const payWithPackage = async (pkg: MemberPackage) => {
    if (!token || !clubId || !selected) return;
    const remaining = Math.max(0, Number(selected.totalPrice) - Number(selected.paidAmount));
    if (remaining <= 0) { setError('Rien à encaisser.'); return; }
    setBusy(true);
    try {
      setError(null);
      await api.adminAddPayment(clubId, selected.id, {
        amount: remaining,
        method: pkg.kind === 'ENTRIES' ? 'PACK_CREDIT' : 'WALLET',
        sourcePackageId: pkg.id,
      }, token);
      setSelected(null); await load();
    } catch (e) {
      setError((e as Error).message === 'INSUFFICIENT_BALANCE' ? 'Solde du package insuffisant.' : (e as Error).message);
    }
    finally { setBusy(false); }
  };

  const openCreate = (prefill?: { resourceId?: string; startHour?: number }) => {
    const sh = Math.max(minOpen, Math.min(prefill?.startHour ?? minOpen, maxClose - 1));
    setCType('EVENT');
    setCResId(prefill?.resourceId ?? resources[0]?.id ?? '');
    setCDate(date);
    setCStart(`${String(sh).padStart(2, '0')}:00`);
    setCEnd(`${String(Math.min(sh + 1, maxClose)).padStart(2, '0')}:00`);
    setCTitle(''); setCMemberId(null); setCMemberQuery(''); setCPrice('');
    setError(null);
    setCreateOpen(true);
  };

  const submitCreate = async () => {
    if (!token || !clubId) return;
    if (!cResourceId) { setError('Choisis un terrain.'); return; }
    if (cEnd <= cStart) { setError('L’heure de fin doit être après le début.'); return; }
    setBusy(true);
    try {
      setError(null);
      await api.adminCreateReservation(clubId, {
        resourceId: cResourceId, date: cDate, startTime: cStart, endTime: cEnd,
        type: cType,
        title: cTitle.trim() || undefined,
        memberUserId: cMemberId ?? undefined,
        price: cPrice ? Number(cPrice) : undefined,
      }, token);
      setCreateOpen(false);
      await load();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };

  const memberMatches = cMemberQuery.trim().length > 0 && !cMemberId
    ? members.filter((m) => `${m.firstName} ${m.lastName} ${m.email}`.toLowerCase().includes(cMemberQuery.toLowerCase())).slice(0, 6)
    : [];

  return (
    <div ref={rootRef} style={isFs ? { background: th.bg, padding: '22px 26px', minHeight: '100vh', overflow: 'auto' } : undefined}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, margin: '0 0 18px', flexWrap: 'wrap' }}>
        <h1 style={{ fontFamily: th.fontDisplay, fontWeight: 600, fontSize: 34, letterSpacing: -0.5, margin: 0, color: th.text }}>Planning du jour</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <Btn type="button" icon="plus" onClick={() => openCreate()}>Ajouter</Btn>
          <button type="button" onClick={() => setCollapsed(!collapsed)} style={chromeBtn}>{collapsed ? 'Afficher le menu' : 'Masquer le menu'}</button>
          <button type="button" onClick={toggleFs} style={chromeBtn}>⛶ {isFs ? 'Quitter' : 'Plein écran'}</button>
        </div>
      </div>

      {/* barre : navigation jour + statistiques */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 14, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button type="button" onClick={() => setDate(shiftDate(date, -1))} aria-label="Jour précédent" style={arrow}>‹</button>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontFamily: th.fontDisplay, fontWeight: 600, fontSize: 17, color: th.text, textTransform: 'capitalize', lineHeight: 1.1 }}>{fmtDay(date)}</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ marginTop: 4, border: `1px solid ${th.line}`, background: th.bg, color: th.textMute, borderRadius: 8, padding: '3px 6px', fontFamily: th.fontUI, fontSize: 12 }} />
          </div>
          <button type="button" onClick={() => setDate(shiftDate(date, 1))} aria-label="Jour suivant" style={arrow}>›</button>
          {date !== todayISO() && (
            <button type="button" onClick={() => setDate(todayISO())} style={{ border: 'none', background: th.surface2, color: th.text, borderRadius: 999, padding: '6px 12px', cursor: 'pointer', fontFamily: th.fontUI, fontSize: 12.5, fontWeight: 600 }}>Aujourd&apos;hui</button>
          )}
        </div>
        <div style={{ display: 'flex', gap: 24 }}>
          {stat('Occupation', `${occupancy}%`)}
          {stat('Réservations', String(shown.length))}
          {stat('Reste dû', `${outstanding.toFixed(outstanding % 1 ? 2 : 0)} €`)}
        </div>
      </div>

      {/* filtres par type (cliquer pour masquer/afficher) */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        {TYPE_ORDER.map((t) => {
          const off = hidden.has(t);
          const c = TYPE_META[t].color;
          return (
            <button key={t} type="button"
              onClick={() => setHidden((prev) => { const n = new Set(prev); if (n.has(t)) n.delete(t); else n.add(t); return n; })}
              style={{
                display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer',
                border: `1px solid ${off ? th.line : c}`, background: off ? 'transparent' : tint(c),
                borderRadius: 999, padding: '5px 12px', fontFamily: th.fontUI, fontSize: 12.5, fontWeight: 600,
                color: off ? th.textFaint : th.text, opacity: off ? 0.6 : 1,
              }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: c }} />
              {TYPE_META[t].label}
            </button>
          );
        })}
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 4, fontFamily: th.fontUI, fontSize: 12, color: th.textFaint }}>
          <span style={{ width: 14, height: 14, borderRadius: 4, border: `1px dashed ${th.textMute}` }} /> en attente
        </span>
      </div>

      {error && <div style={{ marginBottom: 16, background: '#ff7a4d', color: '#fff', borderRadius: 12, padding: '11px 14px', fontFamily: th.fontUI, fontSize: 13.5, fontWeight: 600 }}>{error}</div>}

      {loading ? (
        <div style={{ padding: '32px 0', fontFamily: th.fontUI, color: th.textFaint }}>Chargement…</div>
      ) : resources.length === 0 ? (
        <div style={{ padding: '24px 0', fontFamily: th.fontUI, color: th.textMute }}>Aucun terrain actif.</div>
      ) : (
        <>
        <div ref={gridRef} style={{ borderRadius: 18, background: th.surface, boxShadow: `inset 0 0 0 1px ${th.line}`, overflow: 'auto', maxHeight: isFs ? 'calc(100vh - 190px)' : 'calc(100vh - 300px)' }}>
          <div style={{ position: 'relative', display: 'grid', gridTemplateColumns: `${TIME_W}px repeat(${resources.length}, minmax(${COL_MIN_W}px, 1fr))`, minWidth: '100%' }}>
            {/* coin + en-têtes terrains (sticky en haut) */}
            <div style={{ position: 'sticky', top: 0, left: 0, zIndex: 11, background: th.surface, height: HEADER_H, boxSizing: 'border-box', borderBottom: `1px solid ${th.line}` }} />
            {resources.map((r) => (
              <div key={r.id} style={{ position: 'sticky', top: 0, zIndex: 10, background: th.surface, height: HEADER_H, boxSizing: 'border-box', borderLeft: `1px solid ${th.line}`, borderBottom: `1px solid ${th.line}`, padding: '0 10px', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 1 }}>
                <span style={{ fontFamily: th.fontUI, fontSize: 13, fontWeight: 700, color: th.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {r.name}
                  {courtFormat(typeof r.attributes?.format === 'string' ? r.attributes.format : undefined) && (
                    <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, color: SINGLE_COLOR }}>Single</span>
                  )}
                </span>
                <span style={{ fontFamily: th.fontUI, fontSize: 11, color: th.textMute }}>{Number(r.pricePerHour)}€/h</span>
              </div>
            ))}

            {/* gouttière des heures (sticky à gauche) */}
            <div style={{ position: 'sticky', left: 0, zIndex: 5, background: th.surface, height: hours.length * HOUR_H }}>
              {hours.map((h, i) => (
                <div key={h} style={{ position: 'absolute', top: i * HOUR_H + 4, right: 8, fontFamily: th.fontMono, fontSize: 11, color: th.textFaint }}>{String(h).padStart(2, '0')}:00</div>
              ))}
            </div>

            {/* une colonne par terrain */}
            {resources.map((r) => (
              <div key={r.id}
                onClick={(e) => {
                  if ((e.target as HTMLElement).closest('button')) return; // ne crée pas si on clique une réservation
                  const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                  const h = Math.floor((e.clientY - rect.top) / HOUR_H) + minOpen;
                  openCreate({ resourceId: r.id, startHour: h });
                }}
                style={{ position: 'relative', height: hours.length * HOUR_H, boxSizing: 'border-box', borderLeft: `1px solid ${th.line}`, cursor: 'copy' }}>
                {hours.map((h, i) => i > 0 && (
                  <div key={h} style={{ position: 'absolute', left: 0, right: 0, top: i * HOUR_H, height: 1, background: th.line }} />
                ))}
                {r.openHour > minOpen && (
                  <div style={{ position: 'absolute', left: 0, right: 0, zIndex: 1, top: 0, height: (r.openHour - minOpen) * HOUR_H, background: th.takenBg, backgroundImage: hatch }} />
                )}
                {r.closeHour < maxClose && (
                  <div style={{ position: 'absolute', left: 0, right: 0, zIndex: 1, top: (r.closeHour - minOpen) * HOUR_H, height: (maxClose - r.closeHour) * HOUR_H, background: th.takenBg, backgroundImage: hatch }} />
                )}
                {(byResource.get(r.id) ?? []).map((rv) => {
                  const s = Math.max(localMinutes(rv.startTime, tz), minOpen * 60);
                  let e = Math.min(localMinutes(rv.endTime, tz), maxClose * 60);
                  if (e <= s) e = maxClose * 60; // résa finissant après minuit : clampe à la fermeture
                  const top = ((s - minOpen * 60) / 60) * HOUR_H;
                  const height = Math.max(((e - s) / 60) * HOUR_H - 4, 26);
                  const small = height < 46;
                  const pend = rv.status === 'PENDING';
                  const c = TYPE_META[rv.type].color;
                  return (
                    <button key={rv.id} type="button" onClick={() => openRes(rv)}
                      title={`${labelOf(rv)} · ${TYPE_META[rv.type].label} · ${fmtHM(rv.startTime, tz)}–${fmtHM(rv.endTime, tz)}`}
                      style={{
                        position: 'absolute', top: top + 2, left: 3, right: 3, height, boxSizing: 'border-box',
                        borderRadius: 9, padding: small ? '3px 8px' : '5px 8px', overflow: 'hidden', zIndex: 2, textAlign: 'left', cursor: 'pointer',
                        background: tint(c), boxShadow: `inset 3px 0 0 ${c}`,
                        border: pend ? `1px dashed ${c}` : '1px solid transparent', opacity: pend ? 0.85 : 1,
                        display: 'flex', flexDirection: 'column', justifyContent: 'flex-start', gap: 2,
                      }}>
                      <span style={{ fontFamily: th.fontUI, fontSize: 12.5, fontWeight: 700, color: th.text, lineHeight: 1.15, display: '-webkit-box', WebkitLineClamp: small ? 1 : 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', wordBreak: 'break-word' }}>{labelOf(rv)}</span>
                      {!small && <span style={{ fontFamily: th.fontMono, fontSize: 10, color: th.textMute, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{pend ? 'attente · ' : ''}{fmtHM(rv.startTime, tz)}–{fmtHM(rv.endTime, tz)}</span>}
                    </button>
                  );
                })}
              </div>
            ))}

            {/* barre d'heure courante */}
            {nowVisible && (
              <div style={{ position: 'absolute', top: HEADER_H + nowTop, left: TIME_W, right: 0, height: 2, background: '#ff7a4d', zIndex: 6, pointerEvents: 'none' }}>
                <div style={{ position: 'absolute', top: -3, left: -3, width: 8, height: 8, borderRadius: 4, background: '#ff7a4d' }} />
              </div>
            )}
          </div>
        </div>
        <div style={{ marginTop: 12, fontFamily: th.fontUI, fontSize: 12.5, color: th.textFaint }}>{resources.length} terrain{resources.length > 1 ? 's' : ''} · {shown.length} réservation{shown.length > 1 ? 's' : ''} affichée{shown.length > 1 ? 's' : ''}</div>
        </>
      )}

      {/* modale détail réservation */}
      {selected && (
        <div onClick={() => setSelected(null)}
          style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div onClick={(e) => e.stopPropagation()}
            style={{ width: '100%', maxWidth: 460, background: th.surface, borderRadius: 18, boxShadow: th.shadow, padding: 22, fontFamily: th.fontUI }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
              <div>
                <div style={{ fontFamily: th.fontDisplay, fontWeight: 600, fontSize: 21, color: th.text }}>{selected.resource.name}</div>
                <div style={{ fontFamily: th.fontMono, fontSize: 13, color: th.textMute, marginTop: 2 }}>{fmtHM(selected.startTime, tz)} – {fmtHM(selected.endTime, tz)} · {STATUS_LABEL[selected.status]}</div>
              </div>
              <button onClick={() => setSelected(null)} aria-label="Fermer" style={{ border: 'none', background: th.surface2, cursor: 'pointer', borderRadius: 9, width: 30, height: 30, color: th.textMute, fontSize: 16 }}>✕</button>
            </div>

            <div style={{ marginTop: 14, fontFamily: th.fontUI, fontSize: 14, color: th.text }}>
              {labelOf(selected)}
              {selected.user && <div style={{ fontSize: 12.5, color: th.textFaint }}>{selected.user.email}</div>}
            </div>
            <div style={{ marginTop: 10, display: 'flex', gap: 18, fontFamily: th.fontUI, fontSize: 13 }}>
              <span style={{ color: th.textMute }}>Total : <b style={{ color: th.text }}>{selected.totalPrice} €</b></span>
              <span style={{ color: th.textMute }}>Payé : <b style={{ color: th.text }}>{selected.paidAmount} €</b></span>
              <span style={{ color: th.textMute }}>Reste : <b style={{ color: '#ff7a4d' }}>{Math.max(0, Number(selected.totalPrice) - Number(selected.paidAmount)).toFixed(2)} €</b></span>
            </div>

            {/* choix du type */}
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, color: th.textMute, marginBottom: 8 }}>Type</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {TYPE_ORDER.map((t) => {
                  const on = selected.type === t;
                  const c = TYPE_META[t].color;
                  return (
                    <button key={t} type="button" disabled={busy} onClick={() => changeType(t)}
                      style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: busy ? 'default' : 'pointer', border: `1.5px solid ${on ? c : th.line}`, background: on ? tint(c) : 'transparent', borderRadius: 10, padding: '7px 12px', fontFamily: th.fontUI, fontSize: 13, fontWeight: 600, color: th.text }}>
                      <span style={{ width: 10, height: 10, borderRadius: 3, background: c }} />{TYPE_META[t].label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* encaissement rapide */}
            {selected.status !== 'CANCELLED' && (
              <div style={{ marginTop: 16 }}>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
                  <label style={{ fontSize: 12, color: th.textMute, display: 'flex', flexDirection: 'column', gap: 4 }}>Encaisser €
                    <input type="number" min={0} step="0.5" value={payForm.amount} onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })} style={{ border: `1px solid ${th.line}`, background: th.bg, color: th.text, borderRadius: 8, padding: '7px 10px', fontFamily: th.fontUI, fontSize: 14, width: 90 }} />
                  </label>
                  <label style={{ fontSize: 12, color: th.textMute, display: 'flex', flexDirection: 'column', gap: 4 }}>Moyen
                    <select value={payForm.method} onChange={(e) => setPayForm({ ...payForm, method: e.target.value as PaymentMethod })} style={{ border: `1px solid ${th.line}`, background: th.bg, color: th.text, borderRadius: 8, padding: '7px 10px', fontFamily: th.fontUI, fontSize: 14 }}>
                      {Object.keys(METHOD_LABEL).map((m) => <option key={m} value={m}>{METHOD_LABEL[m]}</option>)}
                    </select>
                  </label>
                  {payForm.method === 'VOUCHER' && (
                    <>
                      <label style={{ fontSize: 12, color: th.textMute, display: 'flex', flexDirection: 'column', gap: 4 }}>Référence
                        <input type="text" value={voucherRef} onChange={(e) => setVoucherRef(e.target.value)} placeholder="N° ticket" style={{ border: `1px solid ${th.line}`, background: th.bg, color: th.text, borderRadius: 8, padding: '7px 10px', fontFamily: th.fontUI, fontSize: 14, width: 100 }} />
                      </label>
                      <label style={{ fontSize: 12, color: th.textMute, display: 'flex', flexDirection: 'column', gap: 4 }}>Émetteur
                        <input type="text" value={voucherIssuer} onChange={(e) => setVoucherIssuer(e.target.value)} placeholder="ANCV…" style={{ border: `1px solid ${th.line}`, background: th.bg, color: th.text, borderRadius: 8, padding: '7px 10px', fontFamily: th.fontUI, fontSize: 14, width: 90 }} />
                      </label>
                    </>
                  )}
                  <Btn onClick={addPayment} icon="check" disabled={busy}>{busy ? '…' : 'Encaisser'}</Btn>
                </div>
                {selPackages.length > 0 && (
                  <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {selPackages.map((p) => {
                      const remaining = Math.max(0, Number(selected.totalPrice) - Number(selected.paidAmount));
                      const ok = canCover(p, remaining);
                      return (
                        <button key={p.id} type="button" disabled={busy || !ok} onClick={() => payWithPackage(p)}
                          title={ok ? 'Solder avec ce package' : 'Solde insuffisant'}
                          style={{ border: `1.5px solid ${th.line}`, background: th.surface2, borderRadius: 10, padding: '7px 12px', cursor: ok ? 'pointer' : 'default', opacity: ok ? 1 : 0.5, fontFamily: th.fontUI, fontSize: 13, fontWeight: 600, color: th.text }}>
                          {packageLabel(p)}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* annulation */}
            {selected.status !== 'CANCELLED' && (
              <div style={{ marginTop: 18, paddingTop: 14, borderTop: `1px solid ${th.line}` }}>
                {confirmCancel ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontFamily: th.fontUI, fontSize: 13, color: th.text }}>Confirmer l&apos;annulation ?</span>
                    <button onClick={doCancel} disabled={busy} style={{ border: 'none', background: '#ff7a4d', color: '#fff', borderRadius: 9, padding: '7px 13px', cursor: 'pointer', fontFamily: th.fontUI, fontSize: 12.5, fontWeight: 600 }}>{busy ? '…' : 'Oui, annuler'}</button>
                    <button onClick={() => setConfirmCancel(false)} style={{ border: 'none', background: 'transparent', color: th.textMute, cursor: 'pointer', fontFamily: th.fontUI, fontSize: 12.5 }}>Retour</button>
                  </div>
                ) : (
                  <button onClick={() => setConfirmCancel(true)} style={{ border: `1px solid ${th.line}`, background: 'transparent', color: '#ff7a4d', borderRadius: 9, padding: '7px 13px', cursor: 'pointer', fontFamily: th.fontUI, fontSize: 12.5, fontWeight: 600 }}>Annuler la réservation</button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {createOpen && (
        <div onClick={() => { setCreateOpen(false); setError(null); }}
          style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div onClick={(e) => e.stopPropagation()}
            style={{ width: '100%', maxWidth: 460, background: th.surface, borderRadius: 18, boxShadow: th.shadow, padding: 22, fontFamily: th.fontUI, maxHeight: '90vh', overflow: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontFamily: th.fontDisplay, fontWeight: 600, fontSize: 21, color: th.text }}>Nouvel événement</div>
              <button onClick={() => { setCreateOpen(false); setError(null); }} aria-label="Fermer" style={{ border: 'none', background: th.surface2, cursor: 'pointer', borderRadius: 9, width: 30, height: 30, color: th.textMute, fontSize: 16 }}>✕</button>
            </div>

            {error && (
              <div style={{ marginTop: 12, background: '#ff7a4d', color: '#fff', borderRadius: 12, padding: '10px 13px', fontFamily: th.fontUI, fontSize: 13, fontWeight: 600 }}>{error}</div>
            )}

            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, color: th.textMute, marginBottom: 8 }}>Type</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {TYPE_ORDER.map((t) => {
                  const on = cType === t;
                  const c = TYPE_META[t].color;
                  return (
                    <button key={t} type="button" onClick={() => setCType(t)}
                      style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer', border: `1.5px solid ${on ? c : th.line}`, background: on ? tint(c) : 'transparent', borderRadius: 10, padding: '7px 12px', fontFamily: th.fontUI, fontSize: 13, fontWeight: 600, color: th.text }}>
                      <span style={{ width: 10, height: 10, borderRadius: 3, background: c }} />{TYPE_META[t].label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div style={{ marginTop: 14, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <label style={{ fontSize: 12, color: th.textMute, display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 160 }}>Terrain
                <select value={cResourceId} onChange={(e) => setCResId(e.target.value)} style={{ border: `1px solid ${th.line}`, background: th.bg, color: th.text, borderRadius: 8, padding: '8px 10px', fontFamily: th.fontUI, fontSize: 14 }}>
                  {resources.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </label>
              <label style={{ fontSize: 12, color: th.textMute, display: 'flex', flexDirection: 'column', gap: 4 }}>Date
                <input type="date" value={cDate} onChange={(e) => setCDate(e.target.value)} style={{ border: `1px solid ${th.line}`, background: th.bg, color: th.text, borderRadius: 8, padding: '7px 10px', fontFamily: th.fontUI, fontSize: 14 }} />
              </label>
            </div>

            <div style={{ marginTop: 12, display: 'flex', gap: 10 }}>
              <label style={{ fontSize: 12, color: th.textMute, display: 'flex', flexDirection: 'column', gap: 4 }}>Début
                <input type="time" value={cStart} onChange={(e) => setCStart(e.target.value)} style={{ border: `1px solid ${th.line}`, background: th.bg, color: th.text, borderRadius: 8, padding: '7px 10px', fontFamily: th.fontUI, fontSize: 14 }} />
              </label>
              <label style={{ fontSize: 12, color: th.textMute, display: 'flex', flexDirection: 'column', gap: 4 }}>Fin
                <input type="time" value={cEnd} onChange={(e) => setCEnd(e.target.value)} style={{ border: `1px solid ${th.line}`, background: th.bg, color: th.text, borderRadius: 8, padding: '7px 10px', fontFamily: th.fontUI, fontSize: 14 }} />
              </label>
            </div>

            <label style={{ marginTop: 12, fontSize: 12, color: th.textMute, display: 'flex', flexDirection: 'column', gap: 4 }}>Intitulé (optionnel)
              <input type="text" value={cTitle} onChange={(e) => setCTitle(e.target.value)} placeholder="Ex. Maintenance, Tournoi P100…" style={{ border: `1px solid ${th.line}`, background: th.bg, color: th.text, borderRadius: 8, padding: '8px 10px', fontFamily: th.fontUI, fontSize: 14 }} />
            </label>

            <div style={{ marginTop: 12, position: 'relative' }}>
              <div style={{ fontSize: 12, color: th.textMute, marginBottom: 4 }}>Membre (optionnel)</div>
              {cMemberId ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, border: `1px solid ${th.line}`, borderRadius: 8, padding: '8px 10px' }}>
                  <span style={{ flex: 1, fontFamily: th.fontUI, fontSize: 14, color: th.text }}>{cMemberQuery}</span>
                  <button type="button" onClick={() => { setCMemberId(null); setCMemberQuery(''); }} style={{ border: 'none', background: th.surface2, cursor: 'pointer', borderRadius: 8, padding: '3px 8px', color: th.textMute, fontSize: 12 }}>Retirer</button>
                </div>
              ) : (
                <input type="text" value={cMemberQuery} onChange={(e) => setCMemberQuery(e.target.value)} placeholder="Rechercher un membre…" style={{ width: '100%', boxSizing: 'border-box', border: `1px solid ${th.line}`, background: th.bg, color: th.text, borderRadius: 8, padding: '8px 10px', fontFamily: th.fontUI, fontSize: 14 }} />
              )}
              {memberMatches.length > 0 && (
                <div style={{ position: 'absolute', left: 0, right: 0, top: '100%', zIndex: 10, background: th.surface, border: `1px solid ${th.line}`, borderRadius: 8, marginTop: 4, overflow: 'hidden', boxShadow: th.shadowSoft }}>
                  {memberMatches.map((m) => (
                    <button key={m.userId} type="button"
                      onClick={() => { setCMemberId(m.userId); setCMemberQuery(`${m.firstName} ${m.lastName}`); }}
                      style={{ display: 'block', width: '100%', textAlign: 'left', border: 'none', background: 'transparent', cursor: 'pointer', padding: '8px 10px', fontFamily: th.fontUI, fontSize: 13.5, color: th.text }}>
                      {m.firstName} {m.lastName} <span style={{ color: th.textFaint }}>· {m.email}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div style={{ marginTop: 14, display: 'flex', alignItems: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
              <label style={{ fontSize: 12, color: th.textMute, display: 'flex', flexDirection: 'column', gap: 4 }}>Prix €
                <input type="number" min={0} step="0.5" value={cPrice} onChange={(e) => setCPrice(e.target.value)} placeholder="0" style={{ border: `1px solid ${th.line}`, background: th.bg, color: th.text, borderRadius: 8, padding: '7px 10px', fontFamily: th.fontUI, fontSize: 14, width: 90 }} />
              </label>
              <div style={{ flex: 1 }} />
              <Btn type="button" icon="check" onClick={submitCreate} disabled={busy}>{busy ? '…' : 'Créer'}</Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
