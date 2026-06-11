import type { OffPeakHours, OffPeakRange, ReservationType } from '@/lib/api';

// Helpers purs de la caisse du planning. Tous les calculs se font en centimes
// (entiers) : les montants API sont des strings décimales ("52.00") et la
// division d'un prix par joueur ne doit jamais passer par des flottants.

/** Parse une string décimale API ("52.00") en centimes (entier). Invalide → 0. */
export function toCents(v: string | number): number {
  const n = Math.round(Number(v) * 100);
  return Number.isFinite(n) ? n : 0;
}

/** Reste dû en centimes (jamais négatif). */
export function remainingCents(totalPrice: string, paidAmount: string): number {
  return Math.max(0, toCents(totalPrice) - toCents(paidAmount));
}

/** Centimes → valeur pour un <input type=number> : "13", "13.5", "4.25" ; 0 → "". */
export function centsToInput(cents: number): string {
  return cents > 0 ? String(cents / 100) : '';
}

/** Centimes → affichage "13 €" / "13,50 €". */
export function fmtEuros(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  const rem = abs % 100;
  const euros = (abs - rem) / 100;
  return rem === 0 ? `${sign}${euros} €` : `${sign}${euros},${String(rem).padStart(2, '0')} €`;
}

// Convention Luxon (comme le backend) : 1 = lundi … 7 = dimanche.
const WEEKDAY: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

function localWeekdayHour(iso: string, tz: string): { weekday: number; hour: number; minute: number } {
  const d = new Date(iso);
  const wd = new Intl.DateTimeFormat('en-GB', { weekday: 'short', timeZone: tz }).format(d);
  const hour = Number(new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hour12: false, timeZone: tz }).format(d));
  const minute = Number(new Intl.DateTimeFormat('en-GB', { minute: '2-digit', timeZone: tz }).format(d));
  return { weekday: WEEKDAY[wd] ?? 1, hour, minute };
}

function rMin(r: OffPeakRange): { s: number; e: number } {
  return { s: r.start * 60 + (r.startMin ?? 0), e: r.end * 60 + (r.endMin ?? 0) };
}

/**
 * Minutes creuses / pleines d'un créneau — walker en minutes RÉELLES qui relit
 * l'heure locale à chaque borne de plage (minuit et changement de jour gérés).
 * Miroir de `splitOffPeakMinutes` dans backend/src/services/pricing.ts —
 * mêmes vecteurs de test des deux côtés.
 */
function splitOffPeakMinutes(
  off: OffPeakHours | null | undefined,
  startMs: number,
  endMs: number,
  tz: string,
): { offPeakMin: number; peakMin: number } {
  let offPeakMin = 0;
  let peakMin = 0;
  let cursorMs = startMs;
  while (cursorMs < endMs) {
    const { weekday, hour, minute } = localWeekdayHour(new Date(cursorMs).toISOString(), tz);
    const t = hour * 60 + minute;
    const ranges = off?.[weekday] ?? [];
    const offPeak = ranges.some((r) => { const { s, e } = rMin(r); return t >= s && t < e; });
    let next = 1440; // prochaine borne de plage strictement après t, sinon minuit
    for (const r of ranges) {
      const { s, e } = rMin(r);
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
 * Tarif du terrain pour un créneau, en centimes, au PRORATA des minutes pleines
 * et creuses (un seul arrondi final — miroir de `proratedTariffCents` backend).
 */
export function tariffCents(
  startISO: string,
  endISO: string,
  tz: string,
  off: OffPeakHours | null | undefined,
  pricePerHour: string,
  offPeakPricePerHour: string | null,
): number {
  const startMs = new Date(startISO).getTime();
  const endMs = new Date(endISO).getTime();
  const priceCents = toCents(pricePerHour);
  if (offPeakPricePerHour == null) return Math.round((priceCents * (endMs - startMs)) / 3_600_000);
  const { offPeakMin, peakMin } = splitOffPeakMinutes(off, startMs, endMs, tz);
  return Math.round((peakMin * priceCents + offPeakMin * toCents(offPeakPricePerHour)) / 60);
}

/**
 * Montant dû d'une réservation, en centimes. Le `dueAmount` calculé par le
 * backend (source de vérité) est prioritaire quand présent ; sinon repli
 * local : prix de la résa s'il existe, sinon tarif du terrain pour un créneau
 * COURT (0 pour le reste — événements libres). C'est aussi le plafond
 * d'encaissement (même règle que le backend).
 */
export function dueCents(
  rv: { type: ReservationType; totalPrice: string; startTime: string; endTime: string; dueAmount?: string },
  resource: { pricePerHour: string; offPeakPricePerHour: string | null } | undefined,
  off: OffPeakHours | null | undefined,
  tz: string,
): number {
  if (rv.dueAmount != null) return toCents(rv.dueAmount);
  const total = toCents(rv.totalPrice);
  if (total > 0) return total;
  if (rv.type !== 'COURT' || !resource) return 0;
  return tariffCents(rv.startTime, rv.endTime, tz, off, resource.pricePerHour, resource.offPeakPricePerHour);
}

export interface QuickAmount {
  key: 'remaining' | 'total' | 'perPlayer';
  label: string;
  cents: number;
}

/**
 * Chips de préremplissage du montant à encaisser, plafonnées au reste dû :
 * « Total » tant que rien n'est payé, « Reste » ensuite, « / joueur » (dû ÷ nb
 * joueurs, arrondi au centime) tant que la part tient dans le reste.
 */
export function quickAmounts(due: number, paid: number, players: number): QuickAmount[] {
  if (due <= 0) return [];
  const remaining = Math.max(0, due - paid);
  if (remaining <= 0) return [];
  const chips: QuickAmount[] = [];
  if (remaining < due) chips.push({ key: 'remaining', label: `Reste ${fmtEuros(remaining)}`, cents: remaining });
  else chips.push({ key: 'total', label: `Total ${fmtEuros(due)}`, cents: due });
  if (players > 1) {
    const per = Math.round(due / players);
    if (per < remaining) chips.push({ key: 'perPlayer', label: `/ joueur ${fmtEuros(per)}`, cents: per });
  }
  return chips;
}

export interface PaymentDotsModel {
  filled: number;
  slots: number;
  overflow: number;
  settled: boolean;
}

/**
 * Modèle des pastilles de paiement d'un bloc du planning : 1 point plein par
 * paiement enregistré, `slots` = nb de joueurs du terrain, soldé quand le
 * payé couvre le dû. `null` si non applicable (pas un créneau COURT payant).
 */
export function paymentDots(
  rv: { type: ReservationType; paidAmount: string; payments: ReadonlyArray<unknown> },
  players: number,
  due: number,
): PaymentDotsModel | null {
  if (rv.type !== 'COURT' || due <= 0) return null;
  const count = rv.payments.length;
  return {
    filled: Math.min(count, players),
    slots: players,
    overflow: Math.max(0, count - players),
    settled: toCents(rv.paidAmount) >= due,
  };
}
