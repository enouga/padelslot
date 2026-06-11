/** Durées proposables (minutes). Le club choisit lesquelles il offre par sport. */
export const ALLOWED_DURATIONS = [60, 90, 120] as const;

/** Libellé court d'une durée en minutes : 60→"1 h", 90→"1 h 30", 120→"2 h". */
export function durationLabel(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h && m) return `${h} h ${String(m).padStart(2, '0')}`;
  if (h) return `${h} h`;
  return `${m} min`;
}

/** Durées effectives d'un sport-de-club : override du club sinon défaut du sport. */
export function effectiveDurations(durationsMin: number[] | undefined, defaultDurationsMin: number[] | undefined): number[] {
  const list = (durationsMin && durationsMin.length) ? durationsMin : (defaultDurationsMin ?? [90]);
  return [...list].sort((a, b) => a - b);
}

/** Durée par défaut sélectionnée : 1h30 si proposée, sinon la première. */
export function defaultDuration(durations: number[]): number {
  return durations.includes(90) ? 90 : (durations[0] ?? 90);
}

/** Heure de fin "HH:mm" = début + durée (minutes), plafonnée à l'heure de fermeture. */
export function endTimeFrom(start: string, durationMin: number, closeHour: number): string {
  const [h, m] = start.split(':').map(Number);
  const end = Math.min(h * 60 + m + durationMin, closeHour * 60);
  return `${String(Math.floor(end / 60)).padStart(2, '0')}:${String(end % 60).padStart(2, '0')}`;
}
