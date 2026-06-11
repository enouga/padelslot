'use client';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useClub } from '@/lib/ClubProvider';
import { useTheme } from '@/lib/ThemeProvider';
import { api, Tournament, ClubEvent } from '@/lib/api';
import { mergeAgenda, filterAgenda, eventPlacesLabel, AgendaFilter, KIND_LABEL } from '@/lib/events';
import { tournamentPlacesLabel } from '@/lib/clubhouse';
import { Screen } from '@/components/ui/Screen';
import { Icon } from '@/components/ui/Icon';
import { ClubNav } from '@/components/ClubNav';

const GENDER_LABEL: Record<string, string> = { MEN: 'Messieurs', WOMEN: 'Dames', MIXED: 'Mixte' };
const FILTERS: { key: AgendaFilter; label: string }[] = [
  { key: 'tout', label: 'Tout' }, { key: 'competitions', label: 'Compétitions' }, { key: 'animations', label: 'Animations' },
];

function formatDate(iso: string, tz: string): string {
  return new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: tz }).format(new Date(iso));
}

export default function EventsPage() {
  const { club, loading } = useClub();
  const { th } = useTheme();
  const router = useRouter();
  const [filter, setFilter] = useState<AgendaFilter>('tout');
  const [tournaments, setTournaments] = useState<Tournament[] | null>(null);
  const [events, setEvents] = useState<ClubEvent[] | null>(null);

  // ?filtre= lu via window.location (convention du projet — pas de useSearchParams/Suspense).
  useEffect(() => {
    const initial = new URLSearchParams(window.location.search).get('filtre');
    if (initial === 'competitions' || initial === 'animations' || initial === 'tout') setFilter(initial);
  }, []);

  useEffect(() => {
    if (!club) return;
    api.getClubTournaments(club.slug).then(setTournaments).catch(() => setTournaments([]));
    api.getClubEvents(club.slug).then(setEvents).catch(() => setEvents([]));
  }, [club?.slug]);

  const items = useMemo(
    () => (tournaments && events ? filterAgenda(mergeAgenda(tournaments, events, new Date()), filter) : null),
    [tournaments, events, filter],
  );

  if (loading || !club) {
    return <div style={{ minHeight: '100vh', background: th.bg, color: th.textFaint, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: th.fontUI }}>Chargement…</div>;
  }

  const chip = (active: boolean) => ({
    border: 'none', cursor: 'pointer', borderRadius: 999, padding: '8px 16px',
    fontFamily: th.fontUI, fontSize: 13.5, fontWeight: 700,
    background: active ? th.ink : th.surface, color: active ? (th.mode === 'floodlit' ? th.text : '#f7f5ee') : th.textMute,
    boxShadow: active ? 'none' : `inset 0 0 0 1px ${th.line}`,
  });

  return (
    <Screen>
      <div style={{ paddingBottom: 40 }}>
        <ClubNav club={club} />

        <div style={{ padding: '18px 20px 0' }}>
          <div style={{ fontFamily: th.fontDisplay, fontWeight: 600, fontSize: 30, color: th.text, letterSpacing: -0.5 }}>Events</div>
          <div style={{ fontFamily: th.fontUI, fontSize: 14, color: th.textMute, marginTop: 4 }}>{club.name}</div>
        </div>

        <div style={{ padding: '16px 20px 0', display: 'flex', gap: 8 }}>
          {FILTERS.map((f) => (
            <button key={f.key} onClick={() => setFilter(f.key)} style={chip(filter === f.key)}>{f.label}</button>
          ))}
        </div>

        <div style={{ padding: '18px 20px 0', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {items === null && <div style={{ fontFamily: th.fontUI, color: th.textFaint }}>Chargement…</div>}
          {items?.length === 0 && <div style={{ fontFamily: th.fontUI, color: th.textMute }}>Rien de prévu pour le moment.</div>}
          {items?.map((item) => {
            const isT = item.source === 'tournament';
            const id = isT ? item.tournament.id : item.event.id;
            const name = isT ? item.tournament.name : item.event.name;
            const tag = isT ? `${item.tournament.category} · ${GENDER_LABEL[item.tournament.gender]}` : KIND_LABEL[item.event.kind];
            const places = isT ? tournamentPlacesLabel(item.tournament) : eventPlacesLabel(item.event);
            const href = isT ? `/tournois/${id}` : `/events/${id}`;
            return (
              <button key={`${item.source}-${id}`} onClick={() => router.push(href)}
                style={{ border: 'none', cursor: 'pointer', textAlign: 'left', width: '100%', background: th.surface, borderRadius: 16, padding: '16px 18px', boxShadow: `inset 0 0 0 1px ${th.line}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Icon name={isT ? 'trophy' : 'bolt'} size={15} color={th.textMute} />
                  <span style={{ fontFamily: th.fontUI, fontSize: 12.5, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase', color: th.textMute }}>{tag}</span>
                </div>
                <div style={{ fontFamily: th.fontUI, fontSize: 16.5, fontWeight: 700, color: th.text, marginTop: 6 }}>{name}</div>
                <div style={{ fontFamily: th.fontUI, fontSize: 13.5, color: th.textMute, marginTop: 3 }}>
                  {formatDate(item.startTime, club.timezone)}
                  {' · '}
                  <span style={{ color: places.urgent ? '#e05656' : th.textMute, fontWeight: places.urgent ? 700 : 400 }}>{places.text}</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </Screen>
  );
}
