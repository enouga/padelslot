import { DateTime } from 'luxon';

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

// ----------------------------------------------------------------- Prorata
// Un créneau peut chevaucher des plages creuses et pleines : on le découpe en
// segments par un walker qui avance en minutes RÉELLES et relit l'heure locale
// à chaque borne — minuit et le changement de jour sont gérés gratuitement.
// Miroir frontend : frontend/lib/caisse.ts (mêmes vecteurs de test).

/** Minutes creuses / pleines d'un créneau, en heure locale du club. */
export function splitOffPeakMinutes(
  off: OffPeakHours | null | undefined,
  start: Date,
  end: Date,
  tz: string,
): { offPeakMin: number; peakMin: number } {
  let offPeakMin = 0;
  let peakMin = 0;
  let cursorMs = start.getTime();
  const endMs = end.getTime();
  while (cursorMs < endMs) {
    const local = DateTime.fromMillis(cursorMs, { zone: tz });
    const t = local.hour * 60 + local.minute;
    const ranges = off?.[local.weekday] ?? [];
    const offPeak = ranges.some((r) => { const { s, e } = rangeMinutes(r); return t >= s && t < e; });
    // Prochaine borne de plage strictement après t, sinon minuit (reclassification au jour suivant).
    let next = 1440;
    for (const r of ranges) {
      const { s, e } = rangeMinutes(r);
      if (s > t && s < next) next = s;
      if (e > t && e < next) next = e;
    }
    const remainMin = Math.ceil((endMs - cursorMs) / 60_000);
    const segMin = Math.max(1, Math.min(next - t, remainMin));
    if (offPeak) offPeakMin += segMin; else peakMin += segMin;
    cursorMs += segMin * 60_000;
  }
  return { offPeakMin, peakMin };
}

/**
 * Tarif au prorata en CENTIMES : minutes pleines × tarif plein + minutes
 * creuses × tarif creux (repli plein si absent), un seul arrondi final —
 * déterministe et identique au miroir frontend.
 */
export function proratedTariffCents(
  off: OffPeakHours | null | undefined,
  start: Date,
  end: Date,
  tz: string,
  priceCentsPerHour: number,
  offPeakCentsPerHour: number | null,
): number {
  if (offPeakCentsPerHour == null) {
    return Math.round((priceCentsPerHour * (end.getTime() - start.getTime())) / 3_600_000);
  }
  const { offPeakMin, peakMin } = splitOffPeakMinutes(off, start, end, tz);
  return Math.round((peakMin * priceCentsPerHour + offPeakMin * offPeakCentsPerHour) / 60);
}

/** Classe d'un créneau pour les quotas : CREUX ssi 100 % des minutes en creuses. */
export function classifySlot(
  off: OffPeakHours | null | undefined,
  start: Date,
  end: Date,
  tz: string,
): 'PEAK' | 'OFF_PEAK' {
  const { peakMin } = splitOffPeakMinutes(off, start, end, tz);
  return peakMin === 0 ? 'OFF_PEAK' : 'PEAK';
}
