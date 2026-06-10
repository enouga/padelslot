import {
  dayKeyInTz,
  todayKey,
  monthGrid,
  addMonths,
  monthLabel,
  enumerateDayKeys,
  buildCalendarEntries,
  entriesByDay,
  CalendarEntry,
} from '@/lib/calendar';
import { MyReservation, MyTournamentRegistration } from '@/lib/api';

function makeReservation(over: Partial<MyReservation> = {}): MyReservation {
  return {
    id: 'res-1',
    startTime: '2026-06-12T16:00:00.000Z',
    endTime: '2026-06-12T17:00:00.000Z',
    status: 'CONFIRMED',
    totalPrice: '25.00',
    resource: { id: 'court-1', name: 'Court 1', club: { name: 'Padel Arena', slug: 'padel-arena', timezone: 'Europe/Paris' } },
    ...over,
  };
}

function makeRegistration(over: {
  id?: string;
  status?: MyTournamentRegistration['status'];
  startTime?: string;
  endTime?: string | null;
  tournamentStatus?: 'DRAFT' | 'PUBLISHED' | 'CANCELLED';
  timezone?: string;
} = {}): MyTournamentRegistration {
  return {
    id: over.id ?? 'reg-1',
    status: over.status ?? 'CONFIRMED',
    createdAt: '2026-06-01T10:00:00.000Z',
    captain: { id: 'u1', firstName: 'Eric', lastName: 'N', email: 'e@x.fr', phone: null },
    partner: { id: 'u2', firstName: 'Marc', lastName: 'D', email: 'm@x.fr', phone: null },
    captainLicense: null,
    partnerLicense: null,
    tournament: {
      id: 't-1',
      clubId: 'club-demo',
      clubSportId: 'cs-1',
      name: 'P100 Messieurs',
      category: 'P100',
      gender: 'MEN',
      description: null,
      startTime: over.startTime ?? '2026-06-13T07:00:00.000Z',
      endTime: over.endTime === undefined ? '2026-06-14T16:00:00.000Z' : over.endTime,
      registrationDeadline: '2026-06-11T22:00:00.000Z',
      maxTeams: 16,
      entryFee: null,
      status: over.tournamentStatus ?? 'PUBLISHED',
      confirmedCount: 4,
      waitlistCount: 0,
      club: { slug: 'padel-arena', name: 'Padel Arena', timezone: over.timezone ?? 'Europe/Paris' },
    },
  };
}

const NOW = new Date('2026-06-10T12:00:00.000Z');

describe('dayKeyInTz', () => {
  it('convertit un instant UTC dans le fuseau du club', () => {
    // 23h30 UTC = 01h30 le lendemain à Paris (été, UTC+2)
    expect(dayKeyInTz('2026-06-10T23:30:00.000Z', 'Europe/Paris')).toBe('2026-06-11');
    expect(dayKeyInTz('2026-06-10T23:30:00.000Z', 'UTC')).toBe('2026-06-10');
  });
});

describe('monthGrid', () => {
  it('juin 2026 commence un lundi : pas de jours du mois précédent', () => {
    const grid = monthGrid(2026, 6);
    expect(grid[0][0]).toEqual({ key: '2026-06-01', day: 1, inMonth: true });
    expect(grid.length).toBe(5); // 30 jours à partir d'un lundi = 5 semaines
    expect(grid[4][6]).toEqual({ key: '2026-07-05', day: 5, inMonth: false });
  });

  it('novembre 2026 commence un dimanche : 6 jours de lead du mois précédent', () => {
    const grid = monthGrid(2026, 11);
    expect(grid[0][0]).toEqual({ key: '2026-10-26', day: 26, inMonth: false });
    expect(grid[0][6]).toEqual({ key: '2026-11-01', day: 1, inMonth: true });
  });

  it('chaque semaine compte exactement 7 cellules', () => {
    for (const week of monthGrid(2026, 2)) expect(week.length).toBe(7);
  });
});

describe('addMonths', () => {
  it('gère les bornes d année dans les deux sens', () => {
    expect(addMonths(2026, 12, 1)).toEqual({ year: 2027, month: 1 });
    expect(addMonths(2026, 1, -1)).toEqual({ year: 2025, month: 12 });
    expect(addMonths(2026, 6, 1)).toEqual({ year: 2026, month: 7 });
  });
});

describe('monthLabel', () => {
  it('libellé français du mois', () => {
    expect(monthLabel(2026, 6).toLowerCase()).toContain('juin');
    expect(monthLabel(2026, 6)).toContain('2026');
  });
});

describe('enumerateDayKeys', () => {
  it('énumère les jours inclusivement', () => {
    expect(enumerateDayKeys('2026-06-13', '2026-06-15')).toEqual(['2026-06-13', '2026-06-14', '2026-06-15']);
    expect(enumerateDayKeys('2026-06-13', '2026-06-13')).toEqual(['2026-06-13']);
  });

  it('traverse le changement d heure de mars sans sauter de jour', () => {
    // Passage à l'heure d'été en Europe : dernier dimanche de mars 2026 = le 29
    expect(enumerateDayKeys('2026-03-28', '2026-03-30')).toEqual(['2026-03-28', '2026-03-29', '2026-03-30']);
  });
});

describe('buildCalendarEntries', () => {
  it('masque les réservations annulées et les inscriptions/tournois annulés', () => {
    const entries = buildCalendarEntries(
      [makeReservation(), makeReservation({ id: 'res-2', status: 'CANCELLED' })],
      [
        makeRegistration(),
        makeRegistration({ id: 'reg-2', status: 'CANCELLED' }),
        makeRegistration({ id: 'reg-3', tournamentStatus: 'CANCELLED' }),
      ],
      NOW,
    );
    expect(entries.map((e) => e.id).sort()).toEqual(['reg-1', 'res-1']);
  });

  it('place la réservation sur son jour dans le fuseau du club', () => {
    // 22h30 UTC la veille = 00h30 à Paris le 13
    const entries = buildCalendarEntries(
      [makeReservation({ startTime: '2026-06-12T22:30:00.000Z', endTime: '2026-06-12T23:30:00.000Z' })],
      [], NOW,
    );
    expect(entries[0]).toMatchObject({ kind: 'reservation', dayKey: '2026-06-13', past: false });
  });

  it('étale un tournoi multi-jours sur toutes ses journées', () => {
    const entries = buildCalendarEntries([], [makeRegistration({
      startTime: '2026-06-13T07:00:00.000Z', endTime: '2026-06-15T16:00:00.000Z',
    })], NOW);
    expect(entries[0]).toMatchObject({
      kind: 'tournament',
      startKey: '2026-06-13',
      endKey: '2026-06-15',
      dayKeys: ['2026-06-13', '2026-06-14', '2026-06-15'],
    });
  });

  it('un tournoi sans endTime tient sur un seul jour', () => {
    const entries = buildCalendarEntries([], [makeRegistration({ endTime: null })], NOW);
    expect(entries[0]).toMatchObject({ startKey: '2026-06-13', endKey: '2026-06-13', dayKeys: ['2026-06-13'] });
  });

  it('marque past les entrées terminées avant now', () => {
    const entries = buildCalendarEntries(
      [makeReservation({ startTime: '2026-06-01T16:00:00.000Z', endTime: '2026-06-01T17:00:00.000Z' })],
      [makeRegistration({ startTime: '2026-06-02T07:00:00.000Z', endTime: '2026-06-03T16:00:00.000Z' })],
      NOW,
    );
    expect(entries.every((e) => e.past)).toBe(true);
  });
});

describe('entriesByDay', () => {
  it('indexe le tournoi multi-jours sur chacun de ses jours, tournois avant réservations', () => {
    const entries: CalendarEntry[] = buildCalendarEntries(
      [makeReservation({ startTime: '2026-06-14T08:00:00.000Z', endTime: '2026-06-14T09:00:00.000Z' })],
      [makeRegistration({ startTime: '2026-06-13T07:00:00.000Z', endTime: '2026-06-15T16:00:00.000Z' })],
      NOW,
    );
    const byDay = entriesByDay(entries);
    expect(byDay.get('2026-06-13')!.map((e) => e.kind)).toEqual(['tournament']);
    expect(byDay.get('2026-06-14')!.map((e) => e.kind)).toEqual(['tournament', 'reservation']);
    expect(byDay.get('2026-06-15')!.map((e) => e.kind)).toEqual(['tournament']);
    expect(byDay.get('2026-06-12')).toBeUndefined();
  });

  it('trie les réservations d un même jour par heure de début', () => {
    const byDay = entriesByDay(buildCalendarEntries(
      [
        makeReservation({ id: 'r-soir', startTime: '2026-06-12T18:00:00.000Z', endTime: '2026-06-12T19:00:00.000Z' }),
        makeReservation({ id: 'r-matin', startTime: '2026-06-12T08:00:00.000Z', endTime: '2026-06-12T09:00:00.000Z' }),
      ],
      [], NOW,
    ));
    expect(byDay.get('2026-06-12')!.map((e) => e.id)).toEqual(['r-matin', 'r-soir']);
  });
});

describe('todayKey', () => {
  it('retourne une clé YYYY-MM-DD', () => {
    expect(todayKey(new Date('2026-06-10T12:00:00.000Z'))).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
