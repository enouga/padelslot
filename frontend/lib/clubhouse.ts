import { ClubAvailability, TimeSlot, Tournament } from '@/lib/api';

export interface UpcomingSlot {
  resourceId: string;
  resourceName: string;
  slot: TimeSlot;
}

/** Date du jour (clé YYYY-MM-DD) — même convention que ClubReserve. */
export function todayISO(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** Les `max` prochains créneaux libres (tous terrains confondus), postérieurs à `now`, triés par heure. */
export function pickUpcomingSlots(avail: ClubAvailability[], now: Date, max = 3): UpcomingSlot[] {
  return avail
    .flatMap((a) =>
      a.slots
        .filter((s) => s.available && new Date(s.startTime) > now)
        .map((slot) => ({ resourceId: a.resource.id, resourceName: a.resource.name, slot })),
    )
    // ISO UTC : ordre lexicographique = ordre chronologique
    .sort((x, y) => x.slot.startTime.localeCompare(y.slot.startTime))
    .slice(0, max);
}

// NB : le bloc « Prochains events » du Club-house fusionne désormais tournois +
// animations via mergeAgenda (lib/events.ts) — l'ancien pickUpcomingTournaments a disparu.

/** Libellé des places d'un tournoi — urgent (rouge) quand il reste ≤ 5 places. */
export function tournamentPlacesLabel(t: Tournament): { text: string; urgent: boolean } {
  if (t.maxTeams != null) {
    const left = t.maxTeams - t.confirmedCount;
    if (left <= 0) return { text: "Complet · liste d'attente possible", urgent: false };
    if (left <= 5) return { text: `Plus que ${left} place${left > 1 ? 's' : ''}`, urgent: true };
    return { text: `${left} places restantes`, urgent: false };
  }
  const n = t.confirmedCount;
  return { text: `${n} binôme${n > 1 ? 's' : ''} inscrit${n > 1 ? 's' : ''}`, urgent: false };
}
