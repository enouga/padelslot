'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useClub } from '@/lib/ClubProvider';
import { useTheme } from '@/lib/ThemeProvider';
import { api, Tournament, ClubEvent, TournamentGender, ClubEventKind } from '@/lib/api';
import { mergeAgenda, applyAgendaFilters, agendaFacets, eventPlacesLabel, AgendaFilter, KIND_LABEL } from '@/lib/events';
import { tournamentPlacesLabel } from '@/lib/clubhouse';
import { fillRatio, formatDateTimeRange } from '@/lib/tournament';
import { ACCENTS } from '@/lib/theme';
import { Screen } from '@/components/ui/Screen';
import { ClubNav } from '@/components/ClubNav';
import { AgendaCard } from '@/components/agenda/AgendaCard';

const GENDER_LABEL: Record<string, string> = { MEN: 'Messieurs', WOMEN: 'Dames', MIXED: 'Mixte' };
const FILTERS: { key: AgendaFilter; label: string }[] = [
  { key: 'tout', label: 'Tout' }, { key: 'competitions', label: 'Compétitions' }, { key: 'animations', label: 'Animations' },
];

export default function EventsPage() {
  const { club, loading } = useClub();
  const { th } = useTheme();
  const router = useRouter();
  const [filter, setFilter] = useState<AgendaFilter>('tout');
  // Facettes secondaires (multi-sélection) ; réinitialisées au changement de source.
  const [categories, setCategories] = useState<Set<string>>(new Set());
  const [genders, setGenders] = useState<Set<TournamentGender>>(new Set());
  const [kinds, setKinds] = useState<Set<ClubEventKind>>(new Set());
  const [memberOnly, setMemberOnly] = useState(false);
  const [tournaments, setTournaments] = useState<Tournament[] | null>(null);
  const [events, setEvents] = useState<ClubEvent[] | null>(null);
  // Horloge unique : null au premier rendu (hydration-safe), pour countdowns et jauges.
  const [now, setNow] = useState<Date | null>(null);

  const clearFacets = () => { setCategories(new Set()); setGenders(new Set()); setKinds(new Set()); setMemberOnly(false); };
  const selectSource = (s: AgendaFilter) => { setFilter(s); clearFacets(); };
  // Synchro URL : on n'écrit qu'après avoir lu l'état initial (évite d'effacer les params au montage).
  const urlReady = useRef(false);

  // État initial lu via window.location (convention du projet — pas de useSearchParams/Suspense) :
  // source ?filtre= + facettes ?cat=&genre=&type=&membres=, séparées par des virgules.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const initial = q.get('filtre');
    if (initial === 'competitions' || initial === 'animations' || initial === 'tout') setFilter(initial);
    const split = (k: string) => (q.get(k) ? q.get(k)!.split(',').filter(Boolean) : []);
    const cats = split('cat'); if (cats.length) setCategories(new Set(cats));
    const gen = split('genre') as TournamentGender[]; if (gen.length) setGenders(new Set(gen));
    const ty = split('type') as ClubEventKind[]; if (ty.length) setKinds(new Set(ty));
    if (q.get('membres') === '1') setMemberOnly(true);
    urlReady.current = true;
  }, []);

  // Reflète l'état des filtres dans l'URL (replaceState : pas d'entrée d'historique, lien partageable).
  useEffect(() => {
    if (!urlReady.current) return;
    const q = new URLSearchParams();
    if (filter !== 'tout') q.set('filtre', filter);
    if (categories.size) q.set('cat', [...categories].join(','));
    if (genders.size) q.set('genre', [...genders].join(','));
    if (kinds.size) q.set('type', [...kinds].join(','));
    if (memberOnly) q.set('membres', '1');
    const qs = q.toString();
    window.history.replaceState(null, '', qs ? `?${qs}` : window.location.pathname);
  }, [filter, categories, genders, kinds, memberOnly]);

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

  // Agenda complet (toutes sources) pour dériver les facettes présentes ; puis filtrage.
  const allItems = useMemo(
    () => (tournaments && events ? mergeAgenda(tournaments, events, new Date()) : null),
    [tournaments, events],
  );
  const facets = useMemo(() => (allItems ? agendaFacets(allItems) : null), [allItems]);
  const items = useMemo(
    () => (allItems ? applyAgendaFilters(allItems, { source: filter, categories, genders, kinds, memberOnly }) : null),
    [allItems, filter, categories, genders, kinds, memberOnly],
  );
  const hasSecondary = (categories.size + genders.size + kinds.size) > 0 || memberOnly;

  if (loading || !club) {
    return <div style={{ minHeight: '100vh', background: th.bg, color: th.textFaint, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: th.fontUI }}>Chargement…</div>;
  }

  const chip = (active: boolean) => ({
    border: 'none', cursor: 'pointer', borderRadius: 999, padding: '8px 16px',
    fontFamily: th.fontUI, fontSize: 13.5, fontWeight: 700,
    background: active ? th.ink : th.surface, color: active ? (th.mode === 'floodlit' ? th.text : '#f7f5ee') : th.textMute,
    boxShadow: active ? 'none' : `inset 0 0 0 1px ${th.line}`,
  });

  // Pastille de facette secondaire (multi-sélection, plus petite que la rangée 1).
  const secChip = (active: boolean) => ({
    border: 'none', cursor: 'pointer', borderRadius: 999, padding: '5px 12px',
    fontFamily: th.fontUI, fontSize: 12.5, fontWeight: 600,
    background: active ? th.accent : th.surface, color: active ? th.onAccent : th.textMute,
    boxShadow: active ? 'none' : `inset 0 0 0 1px ${th.line}`,
  });

  // Toggle générique d'une valeur dans un Set d'état (immutable pour déclencher le rendu).
  function toggle<T>(setter: React.Dispatch<React.SetStateAction<Set<T>>>, value: T) {
    setter((prev) => { const next = new Set(prev); if (next.has(value)) next.delete(value); else next.add(value); return next; });
  }

  const showCategories = (filter === 'tout' || filter === 'competitions') && (facets?.categories.length ?? 0) > 0;
  const showGenders = filter === 'competitions' && (facets?.genders.length ?? 0) > 0;
  const showKinds = (filter === 'tout' || filter === 'animations') && (facets?.kinds.length ?? 0) > 0;
  const showMemberOnly = filter === 'animations' && !!facets?.hasMemberOnly;
  const showSecondaryRow = showCategories || showGenders || showKinds || showMemberOnly;
  const sep = <span style={{ width: 1, alignSelf: 'stretch', background: th.line, margin: '0 4px' }} />;

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
            <button key={f.key} onClick={() => selectSource(f.key)} style={chip(filter === f.key)}>{f.label}</button>
          ))}
        </div>

        {showSecondaryRow && (
          <div style={{ padding: '12px 20px 0', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
            {showCategories && facets!.categories.map((c) => (
              <button key={`cat-${c}`} onClick={() => toggle(setCategories, c)} style={secChip(categories.has(c))}>{c}</button>
            ))}
            {showGenders && (showCategories ? sep : null)}
            {showGenders && facets!.genders.map((g) => (
              <button key={`gen-${g}`} onClick={() => toggle(setGenders, g)} style={secChip(genders.has(g))}>{GENDER_LABEL[g]}</button>
            ))}
            {showKinds && (showCategories ? sep : null)}
            {showKinds && facets!.kinds.map((k) => (
              <button key={`kind-${k}`} onClick={() => toggle(setKinds, k)} style={secChip(kinds.has(k))}>{KIND_LABEL[k]}</button>
            ))}
            {showMemberOnly && (
              <button onClick={() => setMemberOnly((v) => !v)} style={secChip(memberOnly)}>Membres</button>
            )}
            {hasSecondary && (
              <button onClick={clearFacets} style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: th.fontUI, fontSize: 12.5, fontWeight: 600, color: th.textFaint, padding: '5px 8px' }}>Effacer</button>
            )}
          </div>
        )}

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
                dateLabel={formatDateTimeRange(item.startTime, item.endTime, club.timezone)}
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
