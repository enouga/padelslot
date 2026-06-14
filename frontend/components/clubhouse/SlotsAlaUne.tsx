'use client';
import Link from 'next/link';
import { UpcomingSlot } from '@/lib/clubhouse';
import { useTheme } from '@/lib/ThemeProvider';
import { Icon } from '@/components/ui/Icon';

// Jour + heure au fuseau du club (les créneaux peuvent être sur plusieurs jours).
function formatWhen(iso: string, tz: string): string {
  return new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: tz }).format(new Date(iso)).replace(':', 'h');
}

// « Prochains créneaux libres » : les prochains créneaux disponibles (aujourd'hui ou jours
// suivants), lien profond vers la réservation.
export function SlotsAlaUne({ slots, timezone }: { slots: UpcomingSlot[]; timezone: string }) {
  const { th } = useTheme();
  if (slots.length === 0) return null;
  return (
    <div style={{ background: th.surface, borderRadius: 16, padding: '14px 16px', boxShadow: `inset 0 0 0 1px ${th.line}` }}>
      <div style={{ fontFamily: th.fontUI, fontWeight: 700, fontSize: 12.5, letterSpacing: 0.4, textTransform: 'uppercase', color: th.textMute, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
        <Icon name="bolt" size={14} color={th.accentWarm} />Prochains créneaux libres
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        {slots.map((s) => (
          <div key={`${s.resourceId}-${s.slot.startTime}`} style={{ background: th.surface2, borderRadius: 10, padding: '9px 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ flex: 1, fontFamily: th.fontUI, fontSize: 14, color: th.text }}>
              <strong>{s.resourceName}</strong> · {formatWhen(s.slot.startTime, timezone)}
              <span style={{ color: th.textMute, fontSize: 12.5 }}> · {Number(s.slot.price)} €</span>
            </span>
            <Link href={`/reserver?resource=${s.resourceId}&start=${encodeURIComponent(s.slot.startTime)}`}
              style={{ background: th.accent, color: th.onAccent, borderRadius: 9, padding: '6px 12px', fontFamily: th.fontUI, fontSize: 12.5, fontWeight: 700, textDecoration: 'none', whiteSpace: 'nowrap' }}>
              Réserver
            </Link>
          </div>
        ))}
      </div>
    </div>
  );
}
