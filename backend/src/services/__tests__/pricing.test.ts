import { isOffPeakHour, effectiveRate, splitOffPeakMinutes, proratedTariffCents, classifySlot } from '../pricing';

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

// ----------------------------------------------------------------- Prorata
// Vecteurs numériques PARTAGÉS avec frontend/__tests__/caisse.test.ts (anti-drift).
// Lundi 8 juin 2026, Europe/Paris (UTC+2 en juin) : 16h locale = 14:00Z.
const TZ = 'Europe/Paris';
const d = (iso: string) => new Date(iso);

describe('splitOffPeakMinutes', () => {
  it('tout plein : lundi 12h-13h30 (entre les plages)', () => {
    expect(splitOffPeakMinutes(OFF, d('2026-06-08T10:00:00Z'), d('2026-06-08T11:30:00Z'), TZ))
      .toEqual({ offPeakMin: 0, peakMin: 90 });
  });
  it('tout creux : lundi 9h-11h', () => {
    expect(splitOffPeakMinutes(OFF, d('2026-06-08T07:00:00Z'), d('2026-06-08T09:00:00Z'), TZ))
      .toEqual({ offPeakMin: 120, peakMin: 0 });
  });
  it('à cheval : lundi 16h-18h (creuses jusqu à 17h)', () => {
    expect(splitOffPeakMinutes(OFF, d('2026-06-08T14:00:00Z'), d('2026-06-08T16:00:00Z'), TZ))
      .toEqual({ offPeakMin: 60, peakMin: 60 });
  });
  it('multi-plages : lundi 11h30-14h30 (creux 30 + plein 120 + creux 30)', () => {
    expect(splitOffPeakMinutes(OFF, d('2026-06-08T09:30:00Z'), d('2026-06-08T12:30:00Z'), TZ))
      .toEqual({ offPeakMin: 60, peakMin: 120 });
  });
  it('précision minute : 9h-10h avec creuses 9h30-12h15', () => {
    expect(splitOffPeakMinutes(OFF_MIN, d('2026-06-08T07:00:00Z'), d('2026-06-08T08:00:00Z'), TZ))
      .toEqual({ offPeakMin: 30, peakMin: 30 });
  });
  it('franchissement de minuit : lundi 23h → mardi 1h (creuses lundi 22h-24h seulement)', () => {
    const NIGHT = { 1: [{ start: 22, end: 24 }] };
    expect(splitOffPeakMinutes(NIGHT, d('2026-06-08T21:00:00Z'), d('2026-06-08T23:00:00Z'), TZ))
      .toEqual({ offPeakMin: 60, peakMin: 60 });
  });
  it('rien de configuré → tout plein', () => {
    expect(splitOffPeakMinutes(null, d('2026-06-08T14:00:00Z'), d('2026-06-08T16:00:00Z'), TZ))
      .toEqual({ offPeakMin: 0, peakMin: 120 });
  });
});

describe('proratedTariffCents', () => {
  // 25 €/h plein (2500 c), 18 €/h creux (1800 c)
  it('tout plein : 90 min × 25 €/h = 37,50 €', () => {
    expect(proratedTariffCents(OFF, d('2026-06-08T10:00:00Z'), d('2026-06-08T11:30:00Z'), TZ, 2500, 1800)).toBe(3750);
  });
  it('tout creux : 2h × 18 €/h = 36 €', () => {
    expect(proratedTariffCents(OFF, d('2026-06-08T07:00:00Z'), d('2026-06-08T09:00:00Z'), TZ, 2500, 1800)).toBe(3600);
  });
  it('à cheval 16h-18h : 1h creuse + 1h pleine = 43 €', () => {
    expect(proratedTariffCents(OFF, d('2026-06-08T14:00:00Z'), d('2026-06-08T16:00:00Z'), TZ, 2500, 1800)).toBe(4300);
  });
  it('multi-plages 11h30-14h30 : 1h creuse + 2h pleines = 68 €', () => {
    expect(proratedTariffCents(OFF, d('2026-06-08T09:30:00Z'), d('2026-06-08T12:30:00Z'), TZ, 2500, 1800)).toBe(6800);
  });
  it('pas de tarif creux → tarif plein × durée, sans walk', () => {
    expect(proratedTariffCents(OFF, d('2026-06-08T14:00:00Z'), d('2026-06-08T16:00:00Z'), TZ, 2500, null)).toBe(5000);
  });
  it('arrondi final unique sur taux impairs : 16h-17h30 à 25,50/17,33 €/h', () => {
    // 60 min creuses (16h-17h) + 30 min pleines : round((30×2550 + 60×1733)/60) = 3008
    expect(proratedTariffCents(OFF, d('2026-06-08T14:00:00Z'), d('2026-06-08T15:30:00Z'), TZ, 2550, 1733)).toBe(3008);
  });
});

describe('classifySlot', () => {
  it('OFF_PEAK ssi 100 % des minutes en creuses', () => {
    expect(classifySlot(OFF, d('2026-06-08T07:00:00Z'), d('2026-06-08T09:00:00Z'), TZ)).toBe('OFF_PEAK');
    expect(classifySlot(OFF, d('2026-06-08T14:00:00Z'), d('2026-06-08T16:00:00Z'), TZ)).toBe('PEAK'); // à cheval
    expect(classifySlot(OFF, d('2026-06-08T10:00:00Z'), d('2026-06-08T11:30:00Z'), TZ)).toBe('PEAK');
    expect(classifySlot(null, d('2026-06-08T07:00:00Z'), d('2026-06-08T09:00:00Z'), TZ)).toBe('PEAK');
  });
});
