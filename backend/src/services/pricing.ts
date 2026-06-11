// Tarification heures pleines / creuses.
// offPeakHours = plages d'heures CREUSES par jour de semaine (clé = weekday Luxon
// 1=lundi..7=dimanche), plusieurs plages possibles par jour, précision à la minute.
// Jour non configuré (ou rien de configuré) → tout en heures pleines.
export type OffPeakRange = { start: number; startMin?: number; end: number; endMin?: number };
export type OffPeakHours = Record<number, Array<OffPeakRange>>;

/** Convertit une plage en bornes en minutes depuis minuit. */
function rangeMinutes(r: OffPeakRange): { s: number; e: number } {
  return { s: r.start * 60 + (r.startMin ?? 0), e: r.end * 60 + (r.endMin ?? 0) };
}

/** true si (weekday, hour, minute) tombe dans une plage d'heures CREUSES. minute=0 par défaut. */
export function isOffPeakHour(off: OffPeakHours | null | undefined, weekday: number, hour: number, minute = 0): boolean {
  const ranges = off?.[weekday];
  if (!ranges) return false;
  const t = hour * 60 + minute;
  return ranges.some((r) => { const { s, e } = rangeMinutes(r); return t >= s && t < e; });
}

/** €/h effectif pour un créneau commençant à (weekday, hour[, minute]) en heure locale du club. */
export function effectiveRate(
  off: OffPeakHours | null | undefined,
  weekday: number,
  hour: number,
  pricePerHour: number,
  offPeakPricePerHour: number | null,
  minute = 0,
): { rate: number; offPeak: boolean } {
  if (isOffPeakHour(off, weekday, hour, minute)) return { rate: offPeakPricePerHour ?? pricePerHour, offPeak: true };
  return { rate: pricePerHour, offPeak: false };
}
