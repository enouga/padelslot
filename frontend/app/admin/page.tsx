'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ClubReservationsResponse } from '@/lib/api';
import { useAuth } from '@/lib/useAuth';
import { useClub } from '@/lib/ClubProvider';
import { useTheme } from '@/lib/ThemeProvider';
import { Icon, IconName } from '@/components/ui/Icon';

function StatCard({ label, value, unit, hint, icon, big }: { label: string; value: string | number; unit?: string; hint?: string; icon: IconName; big?: boolean }) {
  const { th } = useTheme();
  return (
    <div style={{ flex: 1, minWidth: 200, background: th.surface, borderRadius: 18, padding: '18px 20px', boxShadow: `inset 0 0 0 1px ${th.line}` }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontFamily: th.fontUI, fontSize: 12.5, fontWeight: 600, letterSpacing: 0.3, textTransform: 'uppercase', color: th.textMute }}>{label}</span>
        <Icon name={icon} size={17} color={th.textFaint} />
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 12 }}>
        <span style={{ fontFamily: th.fontDisplay, fontWeight: 600, fontSize: 44, lineHeight: 0.9, color: big ? th.accent : th.text, letterSpacing: -1 }}>{value}</span>
        {unit && <span style={{ fontFamily: th.fontUI, fontSize: 16, color: th.textMute, fontWeight: 600 }}>{unit}</span>}
      </div>
      {hint && <div style={{ fontFamily: th.fontUI, fontSize: 12.5, color: th.textMute, marginTop: 6 }}>{hint}</div>}
    </div>
  );
}

function NavCard({ title, desc, icon, onClick }: { title: string; desc: string; icon: IconName; onClick: () => void }) {
  const { th } = useTheme();
  return (
    <button onClick={onClick} style={{
      flex: 1, minWidth: 240, textAlign: 'left', cursor: 'pointer', border: 'none',
      background: th.surface, borderRadius: 18, padding: 22, boxShadow: `inset 0 0 0 1px ${th.line}`,
      display: 'flex', alignItems: 'flex-start', gap: 14,
    }}>
      <span style={{ width: 44, height: 44, borderRadius: 12, background: th.surface2, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icon name={icon} size={22} color={th.accent} />
      </span>
      <span>
        <span style={{ display: 'block', fontFamily: th.fontDisplay, fontWeight: 600, fontSize: 22, color: th.text, lineHeight: 1.1 }}>{title}</span>
        <span style={{ display: 'block', fontFamily: th.fontUI, fontSize: 13.5, color: th.textMute, marginTop: 5 }}>{desc}</span>
      </span>
      <Icon name="chevR" size={18} color={th.textFaint} style={{ marginLeft: 'auto' }} />
    </button>
  );
}

export default function AdminDashboard() {
  const router = useRouter();
  const { th } = useTheme();
  const { token, ready } = useAuth();
  const { club } = useClub();
  const clubId = club?.id;
  const [data, setData] = useState<ClubReservationsResponse | null>(null);

  const today = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    if (!ready || !token || !clubId) return;
    api.adminGetReservations(clubId, { date: today }, token).then(setData).catch(() => setData(null));
  }, [ready, token, clubId, today]);

  const reservations = data?.reservations ?? [];
  const confirmed = reservations.filter((r) => r.status === 'CONFIRMED').length;
  const pending   = reservations.filter((r) => r.status === 'PENDING').length;

  return (
    <div>
      <h1 style={{ fontFamily: th.fontDisplay, fontWeight: 600, fontSize: 34, letterSpacing: -0.5, margin: '0 0 4px', color: th.text }}>Tableau de bord</h1>
      <p style={{ fontFamily: th.fontUI, fontSize: 14, color: th.textMute, margin: '0 0 24px' }}>
        {new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date())}
      </p>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14 }}>
        <StatCard label="Réservations du jour" value={confirmed} icon="ticket" big hint={`${pending} en attente`} />
        <StatCard label="Encaissé (confirmées)" value={data ? data.summary.paidTotal : '—'} unit="€" icon="euro" hint="aujourd'hui" />
        <StatCard label="Total du jour" value={data ? data.summary.total : '—'} unit="€" icon="chart" hint="toutes réservations" />
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, marginTop: 16 }}>
        <NavCard title="Ressources" desc="Tarifs, horaires, création et activation des terrains." icon="indoor" onClick={() => router.push('/admin/courts')} />
        <NavCard title="Réservations" desc="Planning du club, montants encaissés, annulations." icon="ticket" onClick={() => router.push('/admin/reservations')} />
      </div>
    </div>
  );
}
