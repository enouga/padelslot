import type { ReservationType } from '@/lib/api';

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

export interface QuickAmount {
  key: 'remaining' | 'total' | 'perPlayer';
  label: string;
  cents: number;
}

/**
 * Chips de préremplissage du montant à encaisser :
 * « Reste » (si paiement partiel en cours), « Total », « / joueur » (total ÷ nb
 * joueurs, arrondi au centime). Rien si la résa est gratuite.
 */
export function quickAmounts(rv: { totalPrice: string; paidAmount: string }, players: number): QuickAmount[] {
  const total = toCents(rv.totalPrice);
  if (total <= 0) return [];
  const remaining = remainingCents(rv.totalPrice, rv.paidAmount);
  const chips: QuickAmount[] = [];
  if (remaining > 0 && remaining < total) chips.push({ key: 'remaining', label: `Reste ${fmtEuros(remaining)}`, cents: remaining });
  chips.push({ key: 'total', label: `Total ${fmtEuros(total)}`, cents: total });
  if (players > 1) {
    const per = Math.round(total / players);
    chips.push({ key: 'perPlayer', label: `/ joueur ${fmtEuros(per)}`, cents: per });
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
 * paiement enregistré, `slots` = nb de joueurs du terrain. `null` si non
 * applicable (résa non payante ou autre chose qu'un créneau terrain).
 */
export function paymentDots(
  rv: { type: ReservationType; totalPrice: string; paidAmount: string; payments: ReadonlyArray<unknown> },
  players: number,
): PaymentDotsModel | null {
  if (rv.type !== 'COURT' || toCents(rv.totalPrice) <= 0) return null;
  const count = rv.payments.length;
  return {
    filled: Math.min(count, players),
    slots: players,
    overflow: Math.max(0, count - players),
    settled: remainingCents(rv.totalPrice, rv.paidAmount) <= 0,
  };
}
