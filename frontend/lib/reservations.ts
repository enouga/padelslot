import { MyReservation } from './api';

/** Vrai tant qu'on est à plus de `cutoffHours` du début. cutoff 0/absent = jusqu'au début. */
function withinWindow(startTimeIso: string, cutoffHours: number | undefined, now: number): boolean {
  const deadline = new Date(startTimeIso).getTime() - Math.max(0, cutoffHours ?? 0) * 3_600_000;
  return now <= deadline;
}

/** L'organisateur peut-il encore changer les joueurs ? (résa confirmée + délai non dépassé) */
export function isPlayerChangeOpen(r: MyReservation, now: number): boolean {
  return r.status === 'CONFIRMED' && withinWindow(r.startTime, r.resource.club.playerChangeCutoffHours, now);
}

/** L'organisateur peut-il encore annuler ? (résa non annulée + délai non dépassé) */
export function isCancellationOpen(r: MyReservation, now: number): boolean {
  return r.status !== 'CANCELLED' && withinWindow(r.startTime, r.resource.club.cancellationCutoffHours, now);
}
