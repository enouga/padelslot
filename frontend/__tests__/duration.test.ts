import { effectiveDurations, defaultDuration, endTimeFrom, proposableDurations } from '@/lib/duration';

describe('endTimeFrom', () => {
  it('fin = debut + duree', () => {
    expect(endTimeFrom('14:00', 90, 22)).toBe('15:30');
    expect(endTimeFrom('09:00', 60, 22)).toBe('10:00');
    expect(endTimeFrom('10:30', 45, 22)).toBe('11:15');
  });
  it('plafonnee a l heure de fermeture', () => {
    expect(endTimeFrom('21:00', 90, 22)).toBe('22:00');
    expect(endTimeFrom('23:30', 90, 24)).toBe('24:00');
  });
});

describe('proposableDurations', () => {
  it('reunit presets et durees du sport, triees et dedupliquees', () => {
    expect(proposableDurations([45, 90])).toEqual([30, 45, 60, 90, 120]);
    expect(proposableDurations([150])).toEqual([30, 60, 90, 120, 150]);
    expect(proposableDurations([])).toEqual([30, 60, 90, 120]);
  });
});

describe('duree par defaut une ressource (existant)', () => {
  it('1h30 si proposee, sinon la premiere duree du sport', () => {
    expect(defaultDuration(effectiveDurations([60, 90, 120], undefined))).toBe(90);
    expect(defaultDuration(effectiveDurations([60], [90]))).toBe(60);
    expect(defaultDuration(effectiveDurations(undefined, [45, 60]))).toBe(45);
  });
});
