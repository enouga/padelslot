'use client';
import { useState, useEffect, useCallback } from 'react';
import { api, AdminResource, ClubReservation } from '@/lib/api';
import { useAuth } from '@/lib/useAuth';
import { useClub } from '@/lib/ClubProvider';
import { useTheme } from '@/lib/ThemeProvider';

function todayISO(): string { return new Date().toISOString().slice(0, 10); }

// Minutes locales (fuseau du club) depuis minuit pour un instant ISO.
function localMinutes(iso: string, tz: string): number {
  const f = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: tz }).format(new Date(iso));
  const [h, m] = f.split(':').map(Number);
  return h * 60 + m;
}

type CellState = { state: 'free' | 'closed' | 'booked' | 'pending'; label?: string };

export default function AdminPlanningPage() {
  const { th } = useTheme();
  const { token, ready } = useAuth();
  const { club } = useClub();
  const clubId = club?.id;
  const [tz, setTz]             = useState('Europe/Paris');
  const [resources, setResources] = useState<AdminResource[]>([]);
  const [reservations, setRes] = useState<ClubReservation[]>([]);
  const [date, setDate]        = useState(todayISO());
  const [loading, setLoading]  = useState(true);
  const [error, setError]      = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token || !clubId) return;
    setLoading(true);
    try {
      setError(null);
      const [club, res, resv] = await Promise.all([
        api.adminGetClub(clubId, token),
        api.adminGetResources(clubId, token),
        api.adminGetReservations(clubId, { date }, token),
      ]);
      setTz(club.timezone);
      setResources(res.filter((r) => r.isActive));
      setRes(resv.reservations);
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }, [token, clubId, date]);

  useEffect(() => { if (ready && token && clubId) load(); }, [ready, token, clubId, load]);

  const minOpen = resources.length ? Math.min(...resources.map((r) => r.openHour)) : 8;
  const maxClose = resources.length ? Math.max(...resources.map((r) => r.closeHour)) : 22;
  const hours: number[] = [];
  for (let h = minOpen; h < maxClose; h++) hours.push(h);

  // grille[resourceId][hour] = CellState
  const grid: Record<string, Record<number, CellState>> = {};
  for (const r of resources) {
    grid[r.id] = {};
    for (const h of hours) grid[r.id][h] = { state: h < r.openHour || h >= r.closeHour ? 'closed' : 'free' };
  }
  for (const rv of reservations) {
    if (rv.status === 'CANCELLED') continue;
    const cells = grid[rv.resource.id];
    if (!cells) continue;
    const startH = Math.floor(localMinutes(rv.startTime, tz) / 60);
    const endMin = localMinutes(rv.endTime, tz);
    const endH = Math.ceil(endMin / 60);
    const label = `${rv.user.firstName} ${rv.user.lastName.slice(0, 1)}.`;
    for (let h = startH; h < endH; h++) {
      if (cells[h]) cells[h] = { state: rv.status === 'PENDING' ? 'pending' : 'booked', label };
    }
  }

  const colW = 120;

  return (
    <div>
      <h1 style={{ fontFamily: th.fontDisplay, fontWeight: 600, fontSize: 34, letterSpacing: -0.5, margin: '0 0 16px', color: th.text }}>Planning du jour</h1>

      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16, flexWrap: 'wrap' }}>
        <label style={{ fontFamily: th.fontUI, fontSize: 13.5, color: th.textMute, display: 'flex', alignItems: 'center', gap: 8 }}>
          Jour
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ border: `1px solid ${th.line}`, background: th.bg, color: th.text, borderRadius: 8, padding: '6px 8px', fontFamily: th.fontUI, fontSize: 14 }} />
        </label>
        <div style={{ display: 'flex', gap: 14, fontFamily: th.fontUI, fontSize: 12.5, color: th.textMute }}>
          {([['Réservé', th.accent], ['Bloqué', 'outline'], ['Libre', th.surface2]] as const).map(([l, c]) => (
            <span key={l} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 12, height: 12, borderRadius: 4, background: c === 'outline' ? 'transparent' : c, boxShadow: c === 'outline' ? `inset 0 0 0 1.5px ${th.accent}` : 'none' }} />{l}
            </span>
          ))}
        </div>
      </div>

      {error && <div style={{ marginBottom: 16, background: th.accent, color: th.onAccent, borderRadius: 12, padding: '11px 14px', fontFamily: th.fontUI, fontSize: 13.5, fontWeight: 600 }}>{error}</div>}

      {loading ? (
        <div style={{ padding: '32px 0', fontFamily: th.fontUI, color: th.textFaint }}>Chargement…</div>
      ) : resources.length === 0 ? (
        <div style={{ padding: '24px 0', fontFamily: th.fontUI, color: th.textMute }}>Aucun terrain actif.</div>
      ) : (
        <div style={{ overflowX: 'auto', borderRadius: 18, background: th.surface, boxShadow: `inset 0 0 0 1px ${th.line}`, padding: 16 }}>
          {/* en-têtes colonnes */}
          <div style={{ display: 'grid', gridTemplateColumns: `54px repeat(${resources.length}, ${colW}px)`, gap: 6, marginBottom: 6 }}>
            <div />
            {resources.map((r) => (
              <div key={r.id} style={{ textAlign: 'center', fontFamily: th.fontUI, fontSize: 12.5, fontWeight: 700, color: th.text }}>
                {r.name}
                <div style={{ fontFamily: th.fontUI, fontSize: 10.5, color: th.textMute, fontWeight: 500 }}>{Number(r.pricePerHour)}€/h</div>
              </div>
            ))}
          </div>
          {/* lignes heures */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {hours.map((h) => (
              <div key={h} style={{ display: 'grid', gridTemplateColumns: `54px repeat(${resources.length}, ${colW}px)`, gap: 6 }}>
                <div style={{ fontFamily: th.fontMono, fontSize: 11.5, color: th.textFaint, display: 'flex', alignItems: 'center' }}>{String(h).padStart(2, '0')}:00</div>
                {resources.map((r) => {
                  const cell = grid[r.id][h];
                  const booked = cell.state === 'booked', pend = cell.state === 'pending', closed = cell.state === 'closed';
                  return (
                    <div key={r.id} style={{
                      height: 32, borderRadius: 8, display: 'flex', alignItems: 'center', padding: '0 9px', overflow: 'hidden',
                      background: booked ? th.accent : closed ? 'transparent' : th.surface2,
                      boxShadow: pend ? `inset 0 0 0 1.5px ${th.accent}` : closed ? `inset 0 0 0 1px ${th.line}` : 'none',
                      opacity: closed ? 0.4 : 1,
                    }}>
                      {booked && <span style={{ fontFamily: th.fontUI, fontSize: 11.5, fontWeight: 600, color: th.onAccent, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{cell.label}</span>}
                      {pend && <span style={{ fontFamily: th.fontUI, fontSize: 10.5, fontWeight: 600, color: th.accent }}>Bloqué</span>}
                      {closed && <span style={{ fontFamily: th.fontUI, fontSize: 10.5, color: th.textFaint }}>—</span>}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
