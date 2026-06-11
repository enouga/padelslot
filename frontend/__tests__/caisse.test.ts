import { toCents, remainingCents, centsToInput, fmtEuros, tariffCents, dueCents, quickAmounts, paymentDots } from '@/lib/caisse';
import { playerCount } from '@/lib/courtType';
import type { ReservationType } from '@/lib/api';

const TZ = 'Europe/Paris';

const resa = (over: Partial<{ type: ReservationType; totalPrice: string; paidAmount: string; payments: number; startTime: string; endTime: string }> = {}) => ({
  type: over.type ?? ('COURT' as ReservationType),
  totalPrice: over.totalPrice ?? '52.00',
  paidAmount: over.paidAmount ?? '0.00',
  // jeudi 11/06/2026, 16h-17h à Paris (UTC+2 en été)
  startTime: over.startTime ?? '2026-06-11T14:00:00.000Z',
  endTime: over.endTime ?? '2026-06-11T15:00:00.000Z',
  payments: Array.from({ length: over.payments ?? 0 }, (_, i) => ({ id: `pay-${i}` })),
});

describe('toCents', () => {
  it('parse les strings décimales API en centimes entiers', () => {
    expect(toCents('52.00')).toBe(5200);
    expect(toCents('13.5')).toBe(1350);
    expect(toCents(4.25)).toBe(425);
  });
  it('valeur invalide ou vide → 0', () => {
    expect(toCents('')).toBe(0);
    expect(toCents('abc')).toBe(0);
  });
});

describe('remainingCents', () => {
  it('reste dû = total - payé', () => {
    expect(remainingCents('52.00', '13.00')).toBe(3900);
  });
  it('jamais négatif (sur-payé)', () => {
    expect(remainingCents('52.00', '60.00')).toBe(0);
  });
});

describe('centsToInput', () => {
  it('formate sans zéros traînants pour un input number', () => {
    expect(centsToInput(1300)).toBe('13');
    expect(centsToInput(1350)).toBe('13.5');
    expect(centsToInput(425)).toBe('4.25');
    expect(centsToInput(0)).toBe('');
  });
});

describe('fmtEuros', () => {
  it('affiche en euros à la française', () => {
    expect(fmtEuros(1300)).toBe('13 €');
    expect(fmtEuros(1350)).toBe('13,50 €');
  });
});

describe('tariffCents', () => {
  // 2026-06-11 est un jeudi (weekday 4) ; 14:00Z = 16h à Paris. Creuses 8h-17h le jeudi.
  const off = { 4: [{ start: 8, end: 17 }] };

  it('heures creuses : tarif réduit', () => {
    expect(tariffCents('2026-06-11T14:00:00Z', '2026-06-11T15:00:00Z', TZ, off, '52', '30')).toBe(3000);
  });
  it('heures pleines : plein tarif × durée (18h-19h30 → 1,5 h)', () => {
    expect(tariffCents('2026-06-11T16:00:00Z', '2026-06-11T17:30:00Z', TZ, off, '52', '30')).toBe(7800);
  });
  it('pas de plages configurées → toujours plein tarif', () => {
    expect(tariffCents('2026-06-11T14:00:00Z', '2026-06-11T15:00:00Z', TZ, null, '52', '30')).toBe(5200);
  });
  it('pas de tarif heures creuses → plein tarif même en creuses', () => {
    expect(tariffCents('2026-06-11T14:00:00Z', '2026-06-11T15:00:00Z', TZ, off, '52', null)).toBe(5200);
  });
  it('plusieurs plages le même jour : entre deux plages = pleines', () => {
    const split = { 4: [{ start: 8, end: 12 }, { start: 14, end: 17 }] };
    expect(tariffCents('2026-06-11T08:00:00Z', '2026-06-11T09:00:00Z', TZ, split, '52', '30')).toBe(3000);  // 10h locale
    expect(tariffCents('2026-06-11T11:00:00Z', '2026-06-11T12:00:00Z', TZ, split, '52', '30')).toBe(5200);  // 13h locale
    expect(tariffCents('2026-06-11T13:00:00Z', '2026-06-11T14:00:00Z', TZ, split, '52', '30')).toBe(3000);  // 15h locale
  });
  it('précision à la minute : 9h30 creux, 9h15 plein', () => {
    // Jeudi (weekday 4), creuses 9h30–12h00.
    const offMin = { 4: [{ start: 9, startMin: 30, end: 12, endMin: 0 }] };
    // 2026-06-11T07:30Z = 9h30 Paris → borne basse incluse → creux
    expect(tariffCents('2026-06-11T07:30:00Z', '2026-06-11T08:30:00Z', TZ, offMin, '52', '30')).toBe(3000);
    // 2026-06-11T07:15Z = 9h15 Paris → 15 min pleines puis 45 min creuses (prorata)
    expect(tariffCents('2026-06-11T07:15:00Z', '2026-06-11T08:15:00Z', TZ, offMin, '52', '30')).toBe(3550);
    // 2026-06-11T10:00Z = 12h00 Paris → borne haute exclue → plein
    expect(tariffCents('2026-06-11T10:00:00Z', '2026-06-11T11:00:00Z', TZ, offMin, '52', '30')).toBe(5200);
  });
  it('dimanche = weekday 7 (convention Luxon)', () => {
    // 2026-06-14 est un dimanche ; 10:00Z = 12h Paris, creuses 13h-24h → pleines à 12h.
    expect(tariffCents('2026-06-14T10:00:00Z', '2026-06-14T11:00:00Z', TZ, { 7: [{ start: 13, end: 24 }] }, '52', '30')).toBe(5200);
  });

  // Prorata — vecteurs PARTAGÉS avec backend/src/services/__tests__/pricing.test.ts (anti-drift).
  // Lundi 8 juin 2026 à Paris (UTC+2) ; creuses lundi 9h-12h et 14h-17h ; 25/18 €/h.
  describe('prorata creuses/pleines (miroir backend)', () => {
    const OFF = { 1: [{ start: 9, end: 12 }, { start: 14, end: 17 }] };
    it('à cheval 16h-18h : 1h creuse + 1h pleine = 43 €', () => {
      expect(tariffCents('2026-06-08T14:00:00Z', '2026-06-08T16:00:00Z', TZ, OFF, '25', '18')).toBe(4300);
    });
    it('multi-plages 11h30-14h30 : 1h creuse + 2h pleines = 68 €', () => {
      expect(tariffCents('2026-06-08T09:30:00Z', '2026-06-08T12:30:00Z', TZ, OFF, '25', '18')).toBe(6800);
    });
    it('arrondi final unique sur taux impairs : 16h-17h30 à 25,50/17,33 €/h = 30,08 €', () => {
      expect(tariffCents('2026-06-08T14:00:00Z', '2026-06-08T15:30:00Z', TZ, OFF, '25.50', '17.33')).toBe(3008);
    });
    it('franchissement de minuit : lundi 23h → mardi 1h (creuses lundi 22h-24h)', () => {
      expect(tariffCents('2026-06-08T21:00:00Z', '2026-06-08T23:00:00Z', TZ, { 1: [{ start: 22, end: 24 }] }, '25', '18')).toBe(4300);
    });
  });
});

describe('dueCents', () => {
  const courtRes = { pricePerHour: '52', offPeakPricePerHour: '30' };
  const off = { 4: [{ start: 8, end: 17 }] };

  it('prix de la résa quand il existe', () => {
    expect(dueCents(resa(), courtRes, off, TZ)).toBe(5200);
  });
  it('résa COURT sans prix → tarif du terrain (heures creuses)', () => {
    expect(dueCents(resa({ totalPrice: '0' }), courtRes, off, TZ)).toBe(3000);
  });
  it('résa non-COURT sans prix → 0 ; terrain inconnu → 0', () => {
    expect(dueCents(resa({ type: 'EVENT', totalPrice: '0' }), courtRes, off, TZ)).toBe(0);
    expect(dueCents(resa({ totalPrice: '0' }), undefined, off, TZ)).toBe(0);
  });
  it('dueAmount du backend prioritaire quand présent (source de vérité)', () => {
    expect(dueCents({ ...resa({ totalPrice: '0' }), dueAmount: '43.00' }, courtRes, off, TZ)).toBe(4300);
    expect(dueCents({ ...resa({ totalPrice: '52.00' }), dueAmount: '0.00' }, courtRes, off, TZ)).toBe(0);
  });
});

describe('quickAmounts', () => {
  it('rien payé sur un double 52 € → Total 52 et / joueur 13', () => {
    const chips = quickAmounts(5200, 0, 4);
    expect(chips.map((c) => c.key)).toEqual(['total', 'perPlayer']);
    expect(chips.find((c) => c.key === 'perPlayer')!.cents).toBe(1300);
  });
  it('paiement partiel → Reste en premier, Total (qui dépasserait le plafond) disparaît', () => {
    const chips = quickAmounts(5200, 1300, 4);
    expect(chips.map((c) => c.key)).toEqual(['remaining', 'perPlayer']);
    expect(chips[0].cents).toBe(3900);
  });
  it('la part / joueur qui dépasse le reste dû disparaît', () => {
    expect(quickAmounts(5200, 4500, 4).map((c) => c.key)).toEqual(['remaining']);
  });
  it('la part / joueur égale au reste dû est dédupliquée', () => {
    expect(quickAmounts(5200, 3900, 4).map((c) => c.key)).toEqual(['remaining']);
  });
  it('terrain single → prix / 2 ; arrondi au centime (17 € / 4)', () => {
    expect(quickAmounts(1800, 0, 2).find((c) => c.key === 'perPlayer')!.cents).toBe(900);
    expect(quickAmounts(1700, 0, 4).find((c) => c.key === 'perPlayer')!.cents).toBe(425);
  });
  it('soldé ou gratuit → aucune chip', () => {
    expect(quickAmounts(5200, 5200, 4)).toEqual([]);
    expect(quickAmounts(0, 0, 4)).toEqual([]);
  });
  it('libellés en euros lisibles', () => {
    const chips = quickAmounts(1700, 0, 4);
    expect(chips.find((c) => c.key === 'total')!.label).toBe('Total 17 €');
    expect(chips.find((c) => c.key === 'perPlayer')!.label).toBe('/ joueur 4,25 €');
  });
});

describe('paymentDots', () => {
  it('2 paiements sur 4 places → 2 pleines, pas soldé', () => {
    expect(paymentDots(resa({ paidAmount: '26.00', payments: 2 }), 4, 5200))
      .toEqual({ filled: 2, slots: 4, overflow: 0, settled: false });
  });
  it('soldé → settled true même avec moins de paiements que de places', () => {
    expect(paymentDots(resa({ paidAmount: '52.00', payments: 1 }), 4, 5200))
      .toEqual({ filled: 1, slots: 4, overflow: 0, settled: true });
  });
  it('plus de paiements que de places → cap + overflow', () => {
    expect(paymentDots(resa({ paidAmount: '52.00', payments: 5 }), 4, 5200))
      .toEqual({ filled: 4, slots: 4, overflow: 1, settled: true });
  });
  it('résa sans prix mais avec tarif déduit → pastilles sur le dû', () => {
    expect(paymentDots(resa({ totalPrice: '0', paidAmount: '30.00', payments: 1 }), 4, 3000))
      .toEqual({ filled: 1, slots: 4, overflow: 0, settled: true });
  });
  it('non applicable : type ≠ COURT ou dû ≤ 0 → null', () => {
    expect(paymentDots(resa({ type: 'TOURNAMENT', payments: 1 }), 4, 5200)).toBeNull();
    expect(paymentDots(resa({ totalPrice: '0.00' }), 4, 0)).toBeNull();
  });
});

describe('playerCount', () => {
  it('single → 2, double ou inconnu → 4', () => {
    expect(playerCount('single')).toBe(2);
    expect(playerCount('double')).toBe(4);
    expect(playerCount(undefined)).toBe(4);
  });
});
