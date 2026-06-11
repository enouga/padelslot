import { Prisma } from '@prisma/client';

// Quotas de réservations par joueur, choisis par le club (Club.bookingQuotas).
// UPCOMING = nombre max de résas à venir simultanées ; WEEKLY = par semaine
// calendaire lun-dim dans le fuseau du club. Deux jeux de limites : abonnés
// (ClubMembership.isSubscriber) et non-abonnés, par classe d'heures (pleines /
// creuses — une résa est « creuse » ssi 100 % de ses minutes le sont).

export type QuotaLimits = { peak: number | null; offPeak: number | null }; // null = illimité, 0 = bloqué
export type BookingQuotas = {
  model: 'UPCOMING' | 'WEEKLY';
  subscriber: QuotaLimits;
  nonSubscriber: QuotaLimits;
};

const MODELS = ['UPCOMING', 'WEEKLY'];

function normalizeLimits(input: unknown): QuotaLimits {
  if (input == null || typeof input !== 'object' || Array.isArray(input)) throw new Error('VALIDATION_ERROR');
  const read = (v: unknown): number | null => {
    if (v === null || v === undefined) return null;
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v > 999) throw new Error('VALIDATION_ERROR');
    return v;
  };
  const o = input as Record<string, unknown>;
  return { peak: read(o.peak), offPeak: read(o.offPeak) };
}

/** Valide/normalise la config quotas. null → efface (désactivé) ; tout illimité → désactivé aussi. */
export function normalizeBookingQuotas(input: unknown): Prisma.InputJsonValue | typeof Prisma.DbNull {
  if (input === null || input === undefined) return Prisma.DbNull;
  if (typeof input !== 'object' || Array.isArray(input)) throw new Error('VALIDATION_ERROR');
  const o = input as Record<string, unknown>;
  if (typeof o.model !== 'string' || !MODELS.includes(o.model)) throw new Error('VALIDATION_ERROR');
  const subscriber = normalizeLimits(o.subscriber ?? {});
  const nonSubscriber = normalizeLimits(o.nonSubscriber ?? {});
  const allNull = [subscriber.peak, subscriber.offPeak, nonSubscriber.peak, nonSubscriber.offPeak]
    .every((v) => v === null);
  if (allNull) return Prisma.DbNull;
  return { model: o.model, subscriber, nonSubscriber };
}
