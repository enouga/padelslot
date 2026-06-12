import {
  buildAgendaICS, deadlineCountdown, fillRatio, formatDateTime, icsFilename, timelineSteps, waitlistPosition,
} from '../lib/tournament';
import { TournamentParticipant } from '../lib/api';

const NOW = new Date('2026-06-10T12:00:00Z');

describe('deadlineCountdown', () => {
  it('null quand la deadline est passée', () => {
    expect(deadlineCountdown('2026-06-10T11:59:59Z', NOW)).toBeNull();
    expect(deadlineCountdown('2026-06-10T12:00:00Z', NOW)).toBeNull();
  });
  it('< 1 h → minutes, urgent', () => {
    expect(deadlineCountdown('2026-06-10T12:35:00Z', NOW)).toEqual({ text: 'Plus que 35 min', urgent: true });
    expect(deadlineCountdown('2026-06-10T12:00:30Z', NOW)).toEqual({ text: 'Plus que 1 min', urgent: true });
  });
  it('< 48 h → heures, urgent', () => {
    expect(deadlineCountdown('2026-06-10T18:00:00Z', NOW)).toEqual({ text: 'Plus que 6 h', urgent: true });
    expect(deadlineCountdown('2026-06-12T11:00:00Z', NOW)).toEqual({ text: 'Plus que 47 h', urgent: true });
  });
  it('≥ 48 h → J-x, pas urgent', () => {
    expect(deadlineCountdown('2026-06-12T12:00:00Z', NOW)).toEqual({ text: 'J-2', urgent: false });
    expect(deadlineCountdown('2026-06-15T14:00:00Z', NOW)).toEqual({ text: 'J-5', urgent: false });
  });
});

describe('fillRatio', () => {
  it('ratio clampé 0..1', () => {
    expect(fillRatio({ confirmedCount: 7, maxTeams: 12 })).toBeCloseTo(7 / 12);
    expect(fillRatio({ confirmedCount: 15, maxTeams: 12 })).toBe(1);
    expect(fillRatio({ confirmedCount: 0, maxTeams: 12 })).toBe(0);
  });
  it('null sans capacité', () => {
    expect(fillRatio({ confirmedCount: 7, maxTeams: null })).toBeNull();
    expect(fillRatio({ confirmedCount: 7, maxTeams: 0 })).toBeNull();
  });
});

describe('waitlistPosition', () => {
  const p = (id: string, status: 'CONFIRMED' | 'WAITLISTED'): TournamentParticipant =>
    ({ id, status, captain: { firstName: 'A', lastName: 'A', avatarUrl: null }, partner: { firstName: 'B', lastName: 'B', avatarUrl: null } });
  const list = [p('r1', 'CONFIRMED'), p('r2', 'WAITLISTED'), p('r3', 'WAITLISTED')];
  it('position 1-based dans le groupe WAITLISTED', () => {
    expect(waitlistPosition(list, 'r2')).toBe(1);
    expect(waitlistPosition(list, 'r3')).toBe(2);
  });
  it('null pour un confirmé ou un inconnu', () => {
    expect(waitlistPosition(list, 'r1')).toBeNull();
    expect(waitlistPosition(list, 'zz')).toBeNull();
  });
});

describe('timelineSteps', () => {
  const t = { registrationDeadline: '2026-06-12T12:00:00Z', startTime: '2026-06-15T08:00:00Z' };
  it('inscriptions ouvertes → clôture courante', () => {
    expect(timelineSteps(t, NOW).map((s) => s.state)).toEqual(['done', 'current', 'upcoming']);
  });
  it('entre clôture et début → début courant', () => {
    expect(timelineSteps(t, new Date('2026-06-13T12:00:00Z')).map((s) => s.state)).toEqual(['done', 'done', 'current']);
  });
  it('tournoi commencé → tout fait', () => {
    expect(timelineSteps(t, new Date('2026-06-15T09:00:00Z')).map((s) => s.state)).toEqual(['done', 'done', 'done']);
  });
});

describe('buildAgendaICS', () => {
  const t = {
    id: 't1',
    name: 'Grand Prix, été; v2',
    description: 'Ligne 1\nLigne 2',
    startTime: '2026-07-09T12:01:00.000Z',
    endTime: null,
    club: { name: 'Toulouse Padel Indoor' },
  };
  it('événement UTC complet, CRLF, échappement, DTEND = début + 2 h sans endTime', () => {
    const ics = buildAgendaICS(t, 'https://club.palova.fr/tournois/t1', NOW);
    expect(ics).toContain('BEGIN:VCALENDAR\r\n');
    expect(ics).toContain('UID:tournament-t1@palova');
    expect(ics).toContain('DTSTAMP:20260610T120000Z');
    expect(ics).toContain('DTSTART:20260709T120100Z');
    expect(ics).toContain('DTEND:20260709T140100Z');
    expect(ics).toContain('SUMMARY:Grand Prix\\, été\\; v2');
    expect(ics).toContain('DESCRIPTION:Ligne 1\\nLigne 2\\n\\nhttps://club.palova.fr/tournois/t1');
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(ics.split('\r\n').every((l) => l.length <= 74)).toBe(true);
  });
  it('respecte endTime quand présent', () => {
    const ics = buildAgendaICS({ ...t, endTime: '2026-07-09T18:00:00.000Z' }, 'https://x', NOW);
    expect(ics).toContain('DTEND:20260709T180000Z');
  });

  it('uidPrefix event → UID dédié', () => {
    const ics = buildAgendaICS(t, 'https://x', NOW, 'event');
    expect(ics).toContain('UID:event-t1@palova');
  });
});

describe('icsFilename', () => {
  it('slug sans accents ni ponctuation', () => {
    expect(icsFilename('Grand Prix Messieurs — Été P500 !')).toBe('grand-prix-messieurs-ete-p500.ics');
  });
  it('repli quand le nom ne donne rien', () => {
    expect(icsFilename('***')).toBe('tournoi.ics');
  });
});

describe('formatDateTime', () => {
  it('formate dans le fuseau du club', () => {
    expect(formatDateTime('2026-07-09T12:01:00.000Z', 'Europe/Paris')).toBe('jeudi 9 juillet à 14h01');
  });
});
