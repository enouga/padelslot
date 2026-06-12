'use client';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useClub } from '@/lib/ClubProvider';
import { useTheme } from '@/lib/ThemeProvider';
import { api, Tournament, ClubEvent } from '@/lib/api';
import { mergeAgenda, filterAgenda, eventPlacesLabel, AgendaFilter, KIND_LABEL } from '@/lib/events';
import { tournamentPlacesLabel } from '@/lib/clubhouse';
import { fillRatio } from '@/lib/tournament';
import { ACCENTS } from '@/lib/theme';
import { Screen } from '@/components/ui/Screen';
import { ClubNav } from '@/components/ClubNav';
import { AgendaCard } from '@/components/agenda/AgendaCard';

const GENDER_LABEL: Record<string, string> = { MEN: 'Messieurs', WOMEN: 'Dames', MIXED: 'Mixte' };
const FILTERS: { key: AgendaFilter; label: string }[] = [
  { key: 'tout', label: 'Tout' }, { key: 'competitions', label: 'Compétitions' }, { key: 'animations', label: 'Animations' },
];

function formatDate(iso: string, tz: string): string {
  return new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: tz }).format(new Date(iso)).replace(':', 'h');
}

export default function EventsPage() {
  const { club, loading } = useClub();
  const { th } = useTheme();
  const router = useRouter();
  const [filter, setFilter] = useState<AgendaFilter>('tout');
  const [tournaments, setTournaments] = useState<Tournament[] | null>(null);
  const [events, setEvents] = useState<ClubEvent[] | null>(null);
  // Horloge unique : null au premier rendu (hydration-safe), pour countdowns et jauges.
  const [now, setNow] = useState<Date | null>(null);

  // ?filtre= lu via window.location (convention du projet — pas de useSearchParams/Suspense).
  useEffect(() => {
    const initial = new URLSearchParams(window.location.search).get('filtre');
    if (initial === 'competitions' || initial === 'animations' || initial === 'tout') setFilter(initial);
  }, []);

  useEffect(() => {
    const tick = () => setNow(new Date());
    const t = setTimeout(tick, 0);
    const h = setInterval(tick, 60_000);
    return () => { clearTimeout(t); clearInterval(h); };
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
            return (
              <AgendaCard
                key={`${item.source}-${id}`}
                icon={isT ? 'trophy' : 'bolt'}
                accent={isT ? ACCENTS.apricot : ACCENTS.cyan}
                tag={isT ? `${item.tournament.category} · ${GENDER_LABEL[item.tournament.gender]}` : KIND_LABEL[item.event.kind]}
                title={isT ? item.tournament.name : item.event.name}
                dateLabel={formatDate(item.startTime, club.timezone)}
                deadline={isT ? item.tournament.registrationDeadline : item.event.registrationDeadline}
                now={now}
                ratio={isT
                  ? fillRatio(item.tournament)
                  : fillRatio({ confirmedCount: item.event.confirmedCount, maxTeams: item.event.capacity })}
                places={isT ? tournamentPlacesLabel(item.tournament) : eventPlacesLabel(item.event)}
                extra={isT
                  ? (item.tournament.entryFee ? `${item.tournament.entryFee} €` : null)
                  : [item.event.price != null && Number(item.event.price) > 0 ? `${Number(item.event.price)} €` : null, item.event.memberOnly ? 'Membres' : null].filter(Boolean).join(' · ') || null}
                onClick={() => router.push(isT ? `/tournois/${id}` : `/events/${id}`)}
              />
            );
          })}
        </div>
      </div>
    </Screen>
  );
}
