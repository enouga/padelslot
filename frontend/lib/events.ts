import type { Tournament, ClubEvent, ClubEventKind } from '@/lib/api';

// Helpers purs de la page Events : fusion tournois + animations, filtre, libellés.

export type AgendaFilter = 'tout' | 'competitions' | 'animations';

export type AgendaItem =
  | { source: 'tournament'; startTime: string; tournament: Tournament }
  | { source: 'event'; startTime: string; event: ClubEvent };

export const KIND_LABEL: Record<ClubEventKind, string> = {
  MELEE: 'Mêlée', STAGE: 'Stage', SOIREE: 'Soirée', INITIATION: 'Initiation', AUTRE: 'Événement',
};

/** Fusionne tournois + animations PUBLISHED à venir, triés par date de début. */
export function mergeAgenda(tournaments: Tournament[], events: ClubEvent[], now: Date): AgendaItem[] {
  const items: AgendaItem[] = [
    ...tournaments
      .filter((t) => t.status === 'PUBLISHED' && new Date(t.startTime) > now)
      .map((t) => ({ source: 'tournament' as const, startTime: t.startTime, tournament: t })),
    ...events
      .filter((e) => e.status === 'PUBLISHED' && new Date(e.startTime) > now)
      .map((e) => ({ source: 'event' as const, startTime: e.startTime, event: e })),
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
