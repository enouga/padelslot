import { isOffPeakHour, effectiveRate } from '../pricing';

// Lundi : creuses 9h–12h et 14h–17h, le reste en pleines.
const OFF = { 1: [{ start: 9, end: 12 }, { start: 14, end: 17 }] };
// Lundi (minutes) : creuses 9h30–12h15
const OFF_MIN = { 1: [{ start: 9, startMin: 30, end: 12, endMin: 15 }] };

describe('isOffPeakHour', () => {
  it('rien de configuré ou jour non configuré → heures pleines', () => {
    expect(isOffPeakHour(null, 3, 10)).toBe(false);
    expect(isOffPeakHour(OFF, 2, 10)).toBe(false); // mardi non configuré
  });
  it('dans une des plages = creuses, entre les plages = pleines', () => {
    expect(isOffPeakHour(OFF, 1, 9)).toBe(true);
    expect(isOffPeakHour(OFF, 1, 11)).toBe(true);
    expect(isOffPeakHour(OFF, 1, 12)).toBe(false); // borne haute exclue
    expect(isOffPeakHour(OFF, 1, 13)).toBe(false); // entre les deux plages
    expect(isOffPeakHour(OFF, 1, 16)).toBe(true);
    expect(isOffPeakHour(OFF, 1, 19)).toBe(false);
  });
  it('précision à la minute : 9h00 plein, 9h30 creux, 12h15 plein', () => {
    expect(isOffPeakHour(OFF_MIN, 1, 9, 0)).toBe(false);   // avant 9h30
    expect(isOffPeakHour(OFF_MIN, 1, 9, 30)).toBe(true);   // = borne basse
    expect(isOffPeakHour(OFF_MIN, 1, 12, 0)).toBe(true);   // 12h00 < 12h15
    expect(isOffPeakHour(OFF_MIN, 1, 12, 15)).toBe(false); // = borne haute exclue
    expect(isOffPeakHour(OFF_MIN, 1, 12, 30)).toBe(false);
  });
});

describe('effectiveRate', () => {
  it('heures pleines → pricePerHour', () => {
    expect(effectiveRate(OFF, 1, 19, 25, 18)).toEqual({ rate: 25, offPeak: false });
    expect(effectiveRate(OFF, 1, 13, 25, 18)).toEqual({ rate: 25, offPeak: false });
  });
  it('heures creuses → offPeakPricePerHour', () => {
    expect(effectiveRate(OFF, 1, 10, 25, 18)).toEqual({ rate: 18, offPeak: true });
    expect(effectiveRate(OFF, 1, 15, 25, 18)).toEqual({ rate: 18, offPeak: true });
  });
  it('heures creuses sans tarif creux → retombe sur pricePerHour', () => {
    expect(effectiveRate(OFF, 1, 10, 25, null)).toEqual({ rate: 25, offPeak: true });
  });
  it('minute = 0 par défaut, et précision à la minute via 6e arg', () => {
    expect(effectiveRate(OFF_MIN, 1, 9, 25, 18)).toEqual({ rate: 25, offPeak: false });      // 9h00 → plein
    expect(effectiveRate(OFF_MIN, 1, 9, 25, 18, 30)).toEqual({ rate: 18, offPeak: true }); // 9h30 → creux
  });
});
