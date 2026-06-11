import { mergeAgenda, filterAgenda, eventPlacesLabel, KIND_LABEL } from '@/lib/events';
import type { Tournament, ClubEvent } from '@/lib/api';

const NOW = new Date('2026-06-11T12:00:00Z');

const tournoi = (over: Partial<Tournament> = {}): Tournament => ({
  id: 't1', clubId: 'c1', clubSportId: 'cs1', name: 'P100', category: 'P100', gender: 'MEN',
  description: null, startTime: '2026-06-20T08:00:00.000Z', endTime: null,
  registrationDeadline: '2026-06-18T08:00:00.000Z', maxTeams: 8, entryFee: null,
  status: 'PUBLISHED', confirmedCount: 2, waitlistCount: 0, ...over,
} as Tournament);

const anim = (over: Partial<ClubEvent> = {}): ClubEvent => ({
  id: 'e1', clubId: 'c1', name: 'Mêlée du vendredi', kind: 'MELEE', description: null,
  startTime: '2026-06-15T18:00:00.000Z', endTime: null, registrationDeadline: '2026-06-15T12:00:00.000Z',
  capacity: 12, price: null, memberOnly: true, status: 'PUBLISHED', confirmedCount: 4, waitlistCount: 0, ...over,
});

describe('mergeAgenda', () => {
  it('fusionne et trie par date de début, PUBLISHED à venir seulement', () => {
    const items = mergeAgenda([tournoi()], [anim()], NOW);
    expect(items.map((i) => i.source)).toEqual(['event', 'tournament']); // 15/06 avant 20/06
  });
  it('exclut le passé et les non-PUBLISHED', () => {
    const past = anim({ startTime: '2026-06-01T18:00:00.000Z' });
    const draft = tournoi({ status: 'DRAFT' });
    expect(mergeAgenda([draft], [past], NOW)).toHaveLength(0);
  });
});

describe('filterAgenda', () => {
  const items = mergeAgenda([tournoi()], [anim()], NOW);
  it('competitions = tournois seulement, animations = events seulement', () => {
    expect(filterAgenda(items, 'competitions').every((i) => i.source === 'tournament')).toBe(true);
    expect(filterAgenda(items, 'animations').every((i) => i.source === 'event')).toBe(true);
    expect(filterAgenda(items, 'tout')).toHaveLength(2);
  });
});

describe('eventPlacesLabel', () => {
  it('capacité limitée : restantes / urgence / complet', () => {
    expect(eventPlacesLabel(anim({ capacity: 12, confirmedCount: 4 }))).toEqual({ text: '8 places restantes', urgent: false });
    expect(eventPlacesLabel(anim({ capacity: 12, confirmedCount: 9 }))).toEqual({ text: 'Plus que 3 places', urgent: true });
    expect(eventPlacesLabel(anim({ capacity: 12, confirmedCount: 12 }))).toEqual({ text: "Complet · liste d'attente possible", urgent: false });
  });
  it('sans capacité : nombre d inscrits', () => {
    expect(eventPlacesLabel(anim({ capacity: null, confirmedCount: 5 }))).toEqual({ text: '5 inscrits', urgent: false });
    expect(eventPlacesLabel(anim({ capacity: null, confirmedCount: 1 }))).toEqual({ text: '1 inscrit', urgent: false });
  });
});

describe('KIND_LABEL', () => {
  it('couvre tous les kinds', () => {
    expect(KIND_LABEL).toEqual({ MELEE: 'Mêlée', STAGE: 'Stage', SOIREE: 'Soirée', INITIATION: 'Initiation', AUTRE: 'Événement' });
  });
});
