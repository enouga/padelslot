import { toCents, remainingCents, centsToInput, fmtEuros, quickAmounts, paymentDots } from '@/lib/caisse';
import { playerCount } from '@/lib/courtType';
import type { ReservationType } from '@/lib/api';

const resa = (over: { type?: ReservationType; totalPrice?: string; paidAmount?: string; payments?: number } = {}) => ({
  type: over.type ?? ('COURT' as ReservationType),
  totalPrice: over.totalPrice ?? '52.00',
  paidAmount: over.paidAmount ?? '0.00',
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

describe('quickAmounts', () => {
  it('rien payé sur un double 52 € → Total 52 et / joueur 13 (pas de chip Reste en doublon)', () => {
    const chips = quickAmounts(resa(), 4);
    expect(chips.map((c) => c.key)).toEqual(['total', 'perPlayer']);
    expect(chips.find((c) => c.key === 'total')!.cents).toBe(5200);
    expect(chips.find((c) => c.key === 'perPlayer')!.cents).toBe(1300);
  });
  it('paiement partiel → chip Reste en premier', () => {
    const chips = quickAmounts(resa({ paidAmount: '13.00' }), 4);
    expect(chips.map((c) => c.key)).toEqual(['remaining', 'total', 'perPlayer']);
    expect(chips[0].cents).toBe(3900);
  });
  it('terrain single → prix / 2', () => {
    const chips = quickAmounts(resa({ totalPrice: '18.00' }), 2);
    expect(chips.find((c) => c.key === 'perPlayer')!.cents).toBe(900);
  });
  it('arrondi au centime (17 € / 4 = 4,25 €)', () => {
    const chips = quickAmounts(resa({ totalPrice: '17.00' }), 4);
    expect(chips.find((c) => c.key === 'perPlayer')!.cents).toBe(425);
  });
  it('soldé → aucune chip Reste ; prix 0 → aucune chip', () => {
    expect(quickAmounts(resa({ paidAmount: '52.00' }), 4).map((c) => c.key)).toEqual(['total', 'perPlayer']);
    expect(quickAmounts(resa({ totalPrice: '0.00' }), 4)).toEqual([]);
  });
  it('libellés en euros lisibles', () => {
    const chips = quickAmounts(resa({ totalPrice: '17.00' }), 4);
    expect(chips.find((c) => c.key === 'total')!.label).toBe('Total 17 €');
    expect(chips.find((c) => c.key === 'perPlayer')!.label).toBe('/ joueur 4,25 €');
  });
});

describe('paymentDots', () => {
  it('2 paiements sur 4 places → 2 pleines, pas soldé', () => {
    expect(paymentDots(resa({ paidAmount: '26.00', payments: 2 }), 4))
      .toEqual({ filled: 2, slots: 4, overflow: 0, settled: false });
  });
  it('soldé → settled true même avec moins de paiements que de places', () => {
    expect(paymentDots(resa({ paidAmount: '52.00', payments: 1 }), 4))
      .toEqual({ filled: 1, slots: 4, overflow: 0, settled: true });
  });
  it('plus de paiements que de places → cap + overflow', () => {
    expect(paymentDots(resa({ paidAmount: '52.00', payments: 5 }), 4))
      .toEqual({ filled: 4, slots: 4, overflow: 1, settled: true });
  });
  it('terrain single → 2 places', () => {
    expect(paymentDots(resa({ payments: 1 }), 2))
      .toEqual({ filled: 1, slots: 2, overflow: 0, settled: false });
  });
  it('non applicable : type ≠ COURT ou prix ≤ 0 → null', () => {
    expect(paymentDots(resa({ type: 'TOURNAMENT', payments: 1 }), 4)).toBeNull();
    expect(paymentDots(resa({ type: 'EVENT' }), 4)).toBeNull();
    expect(paymentDots(resa({ totalPrice: '0.00' }), 4)).toBeNull();
  });
});

describe('playerCount', () => {
  it('single → 2, double ou inconnu → 4', () => {
    expect(playerCount('single')).toBe(2);
    expect(playerCount('double')).toBe(4);
    expect(playerCount(undefined)).toBe(4);
  });
});
