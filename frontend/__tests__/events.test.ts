import { mergeAgenda, filterAgenda, eventPlacesLabel, KIND_LABEL, agendaFacets, applyAgendaFilters, emptyFilterState } from '@/lib/events';
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
  it('expose endTime de chaque source (pour l’affichage des horaires)', () => {
    const items = mergeAgenda(
      [tournoi({ endTime: '2026-06-20T12:00:00.000Z' })],
      [anim({ endTime: null })],
      NOW,
    );
    expect(items[0].endTime).toBeNull(); // event (15/06)
    expect(items[1].endTime).toBe('2026-06-20T12:00:00.000Z'); // tournoi (20/06)
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

describe('agendaFacets', () => {
  const items = mergeAgenda(
    [
      tournoi({ id: 't1', category: 'P500', gender: 'MIXED', startTime: '2026-06-20T08:00:00.000Z' }),
      tournoi({ id: 't2', category: 'P100', gender: 'MEN', startTime: '2026-06-21T08:00:00.000Z' }),
      tournoi({ id: 't3', category: 'P500', gender: 'MEN', startTime: '2026-06-22T08:00:00.000Z' }),
    ],
    [
      anim({ id: 'e1', kind: 'SOIREE', memberOnly: false, startTime: '2026-06-16T18:00:00.000Z' }),
      anim({ id: 'e2', kind: 'MELEE', memberOnly: true, startTime: '2026-06-17T18:00:00.000Z' }),
    ],
    NOW,
  );

  it('ne renvoie que les valeurs présentes, dédupliquées', () => {
    const f = agendaFacets(items);
    expect(f.categories).toEqual(['P100', 'P500']); // triées P25→P2000, dédup
    expect(f.kinds).toEqual(['MELEE', 'SOIREE']); // triées selon KIND_LABEL
  });

  it('trie les genres MEN, WOMEN, MIXED et expose hasMemberOnly', () => {
    const f = agendaFacets(items);
    expect(f.genders).toEqual(['MEN', 'MIXED']);
    expect(f.hasMemberOnly).toBe(true);
  });

  it('hasMemberOnly = false si aucune animation réservée aux membres', () => {
    const f = agendaFacets(mergeAgenda([], [anim({ memberOnly: false })], NOW));
    expect(f.hasMemberOnly).toBe(false);
  });
});

describe('applyAgendaFilters', () => {
  const t500 = tournoi({ id: 't1', category: 'P500', gender: 'MIXED', startTime: '2026-06-20T08:00:00.000Z' });
  const t100 = tournoi({ id: 't2', category: 'P100', gender: 'MEN', startTime: '2026-06-21T08:00:00.000Z' });
  const eSoiree = anim({ id: 'e1', kind: 'SOIREE', memberOnly: false, startTime: '2026-06-16T18:00:00.000Z' });
  const eMelee = anim({ id: 'e2', kind: 'MELEE', memberOnly: true, startTime: '2026-06-17T18:00:00.000Z' });
  const items = mergeAgenda([t500, t100], [eSoiree, eMelee], NOW);
  const ids = (xs: typeof items) => xs.map((i) => (i.source === 'tournament' ? i.tournament.id : i.event.id)).sort();

  it('état vide = tout passe', () => {
    expect(applyAgendaFilters(items, emptyFilterState()).length).toBe(4);
  });

  it('OU intra-dimension sur la catégorie', () => {
    const out = applyAgendaFilters(items, { ...emptyFilterState(), categories: new Set(['P500', 'P100']) });
    // les deux tournois passent ; les animations passent (catégorie ne les contraint pas)
    expect(ids(out)).toEqual(['e1', 'e2', 't1', 't2']);
  });

  it('une facette ne contraint que sa source (catégorie laisse passer les animations)', () => {
    const out = applyAgendaFilters(items, { ...emptyFilterState(), categories: new Set(['P500']) });
    expect(ids(out)).toEqual(['e1', 'e2', 't1']); // t100 exclu, animations gardées
  });

  it('ET inter-dimensions : catégorie + genre', () => {
    const out = applyAgendaFilters(items, { ...emptyFilterState(), categories: new Set(['P500']), genders: new Set(['MEN']) });
    // t500 est MIXED → exclu ; animations gardées
    expect(ids(out)).toEqual(['e1', 'e2']);
  });

  it('kind et memberOnly contraignent les animations', () => {
    const out = applyAgendaFilters(items, { ...emptyFilterState(), kinds: new Set(['MELEE']) });
    expect(ids(out)).toEqual(['e2', 't1', 't2']); // eSoiree exclu
    const mem = applyAgendaFilters(items, { ...emptyFilterState(), memberOnly: true });
    expect(ids(mem)).toEqual(['e2', 't1', 't2']); // eSoiree (memberOnly false) exclu
  });

  it('combiné avec la source', () => {
    const out = applyAgendaFilters(items, { ...emptyFilterState(), source: 'animations', kinds: new Set(['SOIREE']) });
    expect(ids(out)).toEqual(['e1']);
  });
});
