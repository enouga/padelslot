import { effectiveDurations, defaultDuration, endTimeFrom } from '@/lib/duration';

describe('endTimeFrom', () => {
  it('fin = début + durée', () => {
    expect(endTimeFrom('14:00', 90, 22)).toBe('15:30');
    expect(endTimeFrom('09:00', 60, 22)).toBe('10:00');
    expect(endTimeFrom('10:30', 45, 22)).toBe('11:15');
  });
  it('plafonnée à l’heure de fermeture', () => {
    expect(endTimeFrom('21:00', 90, 22)).toBe('22:00');
    expect(endTimeFrom('23:30', 90, 24)).toBe('24:00');
  });
});

describe('durée par défaut d’une ressource (existant)', () => {
  it('1h30 si proposée, sinon la première durée du sport', () => {
    expect(defaultDuration(effectiveDurations([60, 90, 120], undefined))).toBe(90);
    expect(defaultDuration(effectiveDurations([60], [90]))).toBe(60);
    expect(defaultDuration(effectiveDurations(undefined, [45, 60]))).toBe(45);
  });
});
