import { pickUpcomingSlots, pickUpcomingTournaments, tournamentPlacesLabel, todayISO } from '../lib/clubhouse';
import { ClubAvailability, Tournament } from '../lib/api';

const slot = (startTime: string, available = true) =>
  ({ startTime, endTime: startTime, available, pricePerHour: '25', offPeak: false });
const court = (id: string, name: string, slots: ReturnType<typeof slot>[]) =>
  ({ resource: { id, name }, slots }) as unknown as ClubAvailability;
const NOW = new Date('2026-06-10T12:00:00Z');

describe('pickUpcomingSlots', () => {
  it('garde les créneaux libres postérieurs à maintenant, triés, max 3, tous terrains', () => {
    const avail = [
      court('c1', 'Terrain 1', [slot('2026-06-10T10:00:00Z'), slot('2026-06-10T15:00:00Z'), slot('2026-06-10T18:00:00Z')]),
      court('c2', 'Terrain 2', [slot('2026-06-10T13:00:00Z'), slot('2026-06-10T14:00:00Z', false), slot('2026-06-10T19:00:00Z')]),
    ];
    const out = pickUpcomingSlots(avail, NOW);
    expect(out.map((s) => [s.resourceName, s.slot.startTime])).toEqual([
      ['Terrain 2', '2026-06-10T13:00:00Z'],
      ['Terrain 1', '2026-06-10T15:00:00Z'],
      ['Terrain 1', '2026-06-10T18:00:00Z'],
    ]);
  });

  it('renvoie [] quand plus rien de libre', () => {
    expect(pickUpcomingSlots([court('c1', 'T1', [slot('2026-06-10T10:00:00Z')])], NOW)).toEqual([]);
  });
});

describe('pickUpcomingTournaments', () => {
  const t = (id: string, startTime: string, status = 'PUBLISHED') => ({ id, startTime, status }) as Tournament;
  it('garde les 2 prochains tournois publiés à venir', () => {
    const out = pickUpcomingTournaments([
      t('t-passe', '2026-06-01T09:00:00Z'),
      t('t3', '2026-08-01T09:00:00Z'),
      t('t1', '2026-06-20T09:00:00Z'),
      t('t2', '2026-07-01T09:00:00Z'),
      t('t-draft', '2026-06-15T09:00:00Z', 'DRAFT'),
    ], NOW);
    expect(out.map((x) => x.id)).toEqual(['t1', 't2']);
  });

  it('exclut les tournois CANCELLED et renvoie [] sur liste vide', () => {
    expect(pickUpcomingTournaments([], NOW)).toEqual([]);
    expect(pickUpcomingTournaments([t('t-cancel', '2026-07-01T09:00:00Z', 'CANCELLED')], NOW)).toEqual([]);
  });
});

describe('tournamentPlacesLabel', () => {
  const t = (maxTeams: number | null, confirmedCount: number) => ({ maxTeams, confirmedCount }) as Tournament;
  it('urgence quand ≤ 5 places restantes', () => {
    expect(tournamentPlacesLabel(t(16, 13))).toEqual({ text: 'Plus que 3 places', urgent: true });
    expect(tournamentPlacesLabel(t(16, 15))).toEqual({ text: 'Plus que 1 place', urgent: true });
  });
  it('complet → liste d attente', () => {
    expect(tournamentPlacesLabel(t(16, 16))).toEqual({ text: "Complet · liste d'attente possible", urgent: false });
    expect(tournamentPlacesLabel(t(16, 20))).toEqual({ text: "Complet · liste d'attente possible", urgent: false });
  });
  it('pas d urgence sinon', () => {
    expect(tournamentPlacesLabel(t(16, 4))).toEqual({ text: '12 places restantes', urgent: false });
    expect(tournamentPlacesLabel(t(null, 7))).toEqual({ text: '7 binômes inscrits', urgent: false });
    expect(tournamentPlacesLabel(t(null, 1))).toEqual({ text: '1 binôme inscrit', urgent: false });
  });
});

describe('todayISO', () => {
  it('formate la date injectée en YYYY-MM-DD (UTC)', () => {
    expect(todayISO(new Date('2026-06-10T15:30:00Z'))).toBe('2026-06-10');
  });
});
