import type { Tournament, ClubEvent, ClubEventKind, TournamentGender } from '@/lib/api';

// Helpers purs de la page Events : fusion tournois + animations, filtre, libellés.

export type AgendaFilter = 'tout' | 'competitions' | 'animations';

// Ladder des catégories tournoi, pour trier les facettes (miroir de CATEGORIES côté admin).
export const CATEGORY_ORDER = ['P25', 'P50', 'P100', 'P250', 'P500', 'P1000', 'P1500', 'P2000'];
const GENDER_ORDER: TournamentGender[] = ['MEN', 'WOMEN', 'MIXED'];
const KIND_ORDER: ClubEventKind[] = ['MELEE', 'STAGE', 'SOIREE', 'INITIATION', 'AUTRE'];

export type AgendaItem =
  | { source: 'tournament'; startTime: string; endTime: string | null; tournament: Tournament }
  | { source: 'event'; startTime: string; endTime: string | null; event: ClubEvent };

export const KIND_LABEL: Record<ClubEventKind, string> = {
  MELEE: 'Mêlée', STAGE: 'Stage', SOIREE: 'Soirée', INITIATION: 'Initiation', AUTRE: 'Événement',
};

/** Fusionne tournois + animations PUBLISHED à venir, triés par date de début. */
export function mergeAgenda(tournaments: Tournament[], events: ClubEvent[], now: Date): AgendaItem[] {
  const items: AgendaItem[] = [
    ...tournaments
      .filter((t) => t.status === 'PUBLISHED' && new Date(t.startTime) > now)
      .map((t) => ({ source: 'tournament' as const, startTime: t.startTime, endTime: t.endTime, tournament: t })),
    ...events
      .filter((e) => e.status === 'PUBLISHED' && new Date(e.startTime) > now)
      .map((e) => ({ source: 'event' as const, startTime: e.startTime, endTime: e.endTime, event: e })),
  ];
  // ISO UTC : ordre lexicographique = ordre chronologique
  return items.sort((a, b) => a.startTime.localeCompare(b.startTime));
}

export function filterAgenda(items: AgendaItem[], filter: AgendaFilter): AgendaItem[] {
  if (filter === 'competitions') return items.filter((i) => i.source === 'tournament');
  if (filter === 'animations') return items.filter((i) => i.source === 'event');
  return items;
}

/** Libellé des places d'une animation — urgent (rouge) quand il reste ≤ 5 places. */
export function eventPlacesLabel(e: ClubEvent): { text: string; urgent: boolean } {
  if (e.capacity != null) {
    const left = e.capacity - e.confirmedCount;
    if (left <= 0) return { text: "Complet · liste d'attente possible", urgent: false };
    if (left <= 5) return { text: `Plus que ${left} place${left > 1 ? 's' : ''}`, urgent: true };
    return { text: `${left} places restantes`, urgent: false };
  }
  const n = e.confirmedCount;
  return { text: `${n} inscrit${n > 1 ? 's' : ''}`, urgent: false };
}

// --- Filtres avancés (rangée secondaire contextuelle multi-sélection) ---

export interface EventFilterState {
  source: AgendaFilter;
  categories: Set<string>;        // tournois — OU intra-dimension
  genders: Set<TournamentGender>; // tournois
  kinds: Set<ClubEventKind>;      // animations
  memberOnly: boolean;            // animations — true = réservées aux membres
}

export function emptyFilterState(): EventFilterState {
  return { source: 'tout', categories: new Set(), genders: new Set(), kinds: new Set(), memberOnly: false };
}

/** Valeurs de facettes réellement présentes dans les items, triées et dédupliquées. */
export function agendaFacets(items: AgendaItem[]): {
  categories: string[];
  genders: TournamentGender[];
  kinds: ClubEventKind[];
  hasMemberOnly: boolean;
} {
  const categories = new Set<string>();
  const genders = new Set<TournamentGender>();
  const kinds = new Set<ClubEventKind>();
  let hasMemberOnly = false;
  for (const i of items) {
    if (i.source === 'tournament') {
      categories.add(i.tournament.category);
      genders.add(i.tournament.gender);
    } else {
      kinds.add(i.event.kind);
      if (i.event.memberOnly) hasMemberOnly = true;
    }
  }
  const byOrder = <T>(order: T[]) => (a: T, b: T) => order.indexOf(a) - order.indexOf(b);
  return {
    categories: [...categories].sort(byOrder(CATEGORY_ORDER)),
    genders: [...genders].sort(byOrder(GENDER_ORDER)),
    kinds: [...kinds].sort(byOrder(KIND_ORDER)),
    hasMemberOnly,
  };
}

/**
 * Filtre l'agenda par l'état complet. La source s'applique d'abord ; ensuite chaque
 * facette ne contraint QUE les items de sa source (les autres passent) :
 * tournoi gardé si (catégories vide || cat ∈ set) && (genres vide || genre ∈ set) ;
 * animation gardée si (kinds vide || kind ∈ set) && (!memberOnly || event.memberOnly).
 */
export function applyAgendaFilters(items: AgendaItem[], state: EventFilterState): AgendaItem[] {
  return filterAgenda(items, state.source).filter((i) => {
    if (i.source === 'tournament') {
      if (state.categories.size > 0 && !state.categories.has(i.tournament.category)) return false;
      if (state.genders.size > 0 && !state.genders.has(i.tournament.gender)) return false;
      return true;
    }
    if (state.kinds.size > 0 && !state.kinds.has(i.event.kind)) return false;
    if (state.memberOnly && !i.event.memberOnly) return false;
    return true;
  });
}
