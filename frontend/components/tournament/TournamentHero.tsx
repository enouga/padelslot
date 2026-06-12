'use client';
import { TournamentDetail } from '@/lib/api';
import { tournamentPlacesLabel } from '@/lib/clubhouse';
import { fillRatio, formatDateTime } from '@/lib/tournament';
import { AgendaHero, MetaCardsRow, MetaCard } from '@/components/agenda/AgendaHero';

const GENDER_LABEL: Record<string, string> = { MEN: 'Messieurs', WOMEN: 'Dames', MIXED: 'Mixte' };

// Hero de la fiche tournoi : habillage tournoi au-dessus du AgendaHero partagé.
export function TournamentHero({ t, now }: { t: TournamentDetail; now: Date | null }) {
  return (
    <AgendaHero
      pills={[{ label: t.category, strong: true }, { label: GENDER_LABEL[t.gender] ?? t.gender }]}
      title={t.name}
      subtitle={t.club.name}
      deadline={t.registrationDeadline}
      now={now}
      ratio={fillRatio(t)}
      counter={
        (t.maxTeams != null ? `${t.confirmedCount}/${t.maxTeams} binômes` : `${t.confirmedCount} binôme${t.confirmedCount > 1 ? 's' : ''}`)
        + (t.waitlistCount > 0 ? ` · ${t.waitlistCount} en attente` : '')
      }
      places={tournamentPlacesLabel(t)}
    />
  );
}

// Cartes méta de la fiche tournoi : début, clôture, prix par binôme.
export function MetaCards({ t }: { t: TournamentDetail }) {
  const tz = t.club.timezone;
  const cards: MetaCard[] = [
    { icon: 'calendar', label: 'Début', value: formatDateTime(t.startTime, tz) },
    { icon: 'clock', label: 'Clôture des inscriptions', value: formatDateTime(t.registrationDeadline, tz) },
    ...(t.entryFee ? [{ icon: 'euro', label: 'Inscription', value: `${t.entryFee} € par binôme` } as MetaCard] : []),
  ];
  return <MetaCardsRow cards={cards} />;
}
