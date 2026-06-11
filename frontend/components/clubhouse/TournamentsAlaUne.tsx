'use client';
import Link from 'next/link';
import { tournamentPlacesLabel } from '@/lib/clubhouse';
import { AgendaItem, eventPlacesLabel, KIND_LABEL } from '@/lib/events';
import { useTheme } from '@/lib/ThemeProvider';
import { ACCENTS } from '@/lib/theme';
import { Icon } from '@/components/ui/Icon';

const GENDER_LABEL: Record<string, string> = { MEN: 'Messieurs', WOMEN: 'Dames', MIXED: 'Mixte' };

function formatDay(iso: string, tz: string): string {
  return new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', timeZone: tz }).format(new Date(iso));
}

// « Prochains events » : tournois + animations fusionnés (nom de fichier historique conservé).
// Chaque ligne : badge (catégorie+genre ou type d'animation), date, urgence des places, lien fiche.
export function TournamentsAlaUne({ items, timezone }: { items: AgendaItem[]; timezone: string }) {
  const { th } = useTheme();
  if (items.length === 0) return null;
  return (
    <div style={{ background: th.surface, borderRadius: 16, padding: '14px 16px', boxShadow: `inset 0 0 0 1px ${th.line}` }}>
      <div style={{ fontFamily: th.fontUI, fontWeight: 700, fontSize: 12.5, letterSpacing: 0.4, textTransform: 'uppercase', color: th.textMute, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
        <Icon name="trophy" size={14} color={th.textMute} />Prochains events
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        {items.map((item) => {
          const isT = item.source === 'tournament';
          const id = isT ? item.tournament.id : item.event.id;
          const name = isT ? item.tournament.name : item.event.name;
          const badge = isT ? `${item.tournament.category} · ${GENDER_LABEL[item.tournament.gender]}` : KIND_LABEL[item.event.kind];
          const places = isT ? tournamentPlacesLabel(item.tournament) : eventPlacesLabel(item.event);
          const href = isT ? `/tournois/${id}` : `/events/${id}`;
          return (
            <Link key={`${item.source}-${id}`} href={href} aria-label={name} style={{ textDecoration: 'none', background: th.surface2, borderRadius: 10, padding: '9px 12px', display: 'block' }}>
              <span style={{ fontFamily: th.fontUI, fontSize: 14, fontWeight: 700, color: th.text }}>{name}</span>
              <span style={{ display: 'block', fontFamily: th.fontUI, fontSize: 12.5, color: th.textMute, marginTop: 2 }}>
                {badge}
                {' · '}
                {formatDay(item.startTime, timezone)}
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
