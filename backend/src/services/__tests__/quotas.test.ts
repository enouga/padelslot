import { Prisma } from '@prisma/client';
import { normalizeBookingQuotas } from '../quotas';

const valid = {
  model: 'UPCOMING',
  subscriber: { peak: 3, offPeak: null },
  nonSubscriber: { peak: 1, offPeak: 2 },
};

describe('normalizeBookingQuotas', () => {
  it('null/undefined → DbNull (quotas désactivés)', () => {
    expect(normalizeBookingQuotas(null)).toBe(Prisma.DbNull);
    expect(normalizeBookingQuotas(undefined)).toBe(Prisma.DbNull);
  });

  it('normalise une config valide (UPCOMING et WEEKLY)', () => {
    expect(normalizeBookingQuotas(valid)).toEqual(valid);
    expect(normalizeBookingQuotas({ ...valid, model: 'WEEKLY' })).toEqual({ ...valid, model: 'WEEKLY' });
  });

  it('limite manquante → null (illimité), 0 accepté (bloqué)', () => {
    expect(normalizeBookingQuotas({ model: 'UPCOMING', subscriber: {}, nonSubscriber: { peak: 0 } }))
      .toEqual({ model: 'UPCOMING', subscriber: { peak: null, offPeak: null }, nonSubscriber: { peak: 0, offPeak: null } });
  });

  it('les 4 limites null → DbNull (pas d état « activé sans effet »)', () => {
    expect(normalizeBookingQuotas({ model: 'WEEKLY', subscriber: {}, nonSubscriber: {} })).toBe(Prisma.DbNull);
  });

  it('modèle inconnu → VALIDATION_ERROR', () => {
    expect(() => normalizeBookingQuotas({ ...valid, model: 'MONTHLY' })).toThrow('VALIDATION_ERROR');
    expect(() => normalizeBookingQuotas({ subscriber: {}, nonSubscriber: { peak: 1 } })).toThrow('VALIDATION_ERROR');
  });

  it('limite invalide → VALIDATION_ERROR (négatif, non entier, > 999, type faux)', () => {
    expect(() => normalizeBookingQuotas({ ...valid, nonSubscriber: { peak: -1 } })).toThrow('VALIDATION_ERROR');
    expect(() => normalizeBookingQuotas({ ...valid, nonSubscriber: { peak: 1.5 } })).toThrow('VALIDATION_ERROR');
    expect(() => normalizeBookingQuotas({ ...valid, nonSubscriber: { peak: 1000 } })).toThrow('VALIDATION_ERROR');
    expect(() => normalizeBookingQuotas({ ...valid, nonSubscriber: { peak: 'deux' } })).toThrow('VALIDATION_ERROR');
  });

  it('entrée non-objet → VALIDATION_ERROR', () => {
    expect(() => normalizeBookingQuotas('UPCOMING')).toThrow('VALIDATION_ERROR');
    expect(() => normalizeBookingQuotas(42)).toThrow('VALIDATION_ERROR');
  });
});
