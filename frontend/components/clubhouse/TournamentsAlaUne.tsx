'use client';
import Link from 'next/link';
import { Tournament } from '@/lib/api';
import { tournamentPlacesLabel } from '@/lib/clubhouse';
import { useTheme } from '@/lib/ThemeProvider';
import { ACCENTS } from '@/lib/theme';
import { Icon } from '@/components/ui/Icon';

function formatDay(iso: string, tz: string): string {
  return new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', timeZone: tz }).format(new Date(iso));
}

// « Prochains tournois » : nom, date, urgence des places, lien vers l'inscription.
export function TournamentsAlaUne({ tournaments, timezone }: { tournaments: Tournament[]; timezone: string }) {
  const { th } = useTheme();
  if (tournaments.length === 0) return null;
  return (
    <div style={{ background: th.surface, borderRadius: 16, padding: '14px 16px', boxShadow: `inset 0 0 0 1px ${th.line}` }}>
      <div style={{ fontFamily: th.fontUI, fontWeight: 700, fontSize: 12.5, letterSpacing: 0.4, textTransform: 'uppercase', color: th.textMute, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
        <Icon name="trophy" size={14} color={th.textMute} />Prochains tournois
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        {tournaments.map((t) => {
          const places = tournamentPlacesLabel(t);
          return (
            <Link key={t.id} href={`/tournois/${t.id}`} aria-label={t.name} style={{ textDecoration: 'none', background: th.surface2, borderRadius: 10, padding: '9px 12px', display: 'block' }}>
              <span style={{ fontFamily: th.fontUI, fontSize: 14, fontWeight: 700, color: th.text }}>{t.name}</span>
              <span style={{ display: 'block', fontFamily: th.fontUI, fontSize: 12.5, color: th.textMute, marginTop: 2 }}>
                {formatDay(t.startTime, timezone)}
                {' · '}
                <span style={{ color: places.urgent ? ACCENTS.coral : th.textMute, fontWeight: places.urgent ? 700 : 400 }}>{places.text}</span>
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
