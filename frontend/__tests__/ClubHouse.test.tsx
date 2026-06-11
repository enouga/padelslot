import { render, screen } from '@testing-library/react';
import { ClubHouse } from '../components/ClubHouse';
import { ThemeProvider } from '../lib/ThemeProvider';

jest.mock('../lib/api', () => ({
  api: {
    getClubAnnouncements: jest.fn().mockResolvedValue([]),
    getClubSponsors: jest.fn().mockResolvedValue([]),
    getClubTournaments: jest.fn().mockResolvedValue([]),
    getClubEvents: jest.fn().mockResolvedValue([]),
    getClubAvailability: jest.fn().mockResolvedValue([]),
    getMyReservations: jest.fn().mockResolvedValue([]),
    cancelReservation: jest.fn(),
  },
}));
import { api } from '../lib/api';
const mocked = api as jest.Mocked<typeof api>;

const club = {
  id: 'c1', slug: 'demo', name: 'Club Démo', timezone: 'Europe/Paris',
  clubSports: [{ id: 'cs1', durationsMin: [90], sport: { defaultDurationsMin: [90] }, resources: [] }],
} as never;
const wrap = () => render(<ThemeProvider><ClubHouse club={club} /></ThemeProvider>);

const pinned = { id: 'a1', title: 'Tournoi interne', body: 'Lots !', linkUrl: null, imageUrl: null, isPublished: true, pinned: true, createdAt: '2026-06-09', updatedAt: '' };
const regular = { id: 'a2', title: 'Créneaux du matin', body: 'Dès 8h.', linkUrl: null, imageUrl: null, isPublished: true, pinned: false, createdAt: '2026-06-08', updatedAt: '' };

describe('ClubHouse', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mocked.getClubAnnouncements.mockResolvedValue([]);
    mocked.getClubSponsors.mockResolvedValue([]);
    mocked.getClubTournaments.mockResolvedValue([]);
    mocked.getClubEvents.mockResolvedValue([]);
    mocked.getClubAvailability.mockResolvedValue([]);
  });

  it('annonce épinglée → hero « À la une », sans doublon dans la liste', async () => {
    mocked.getClubAnnouncements.mockResolvedValue([pinned, regular] as never);
    wrap();
    expect(await screen.findByText('À la une')).toBeInTheDocument();
    expect(screen.getAllByText('Tournoi interne')).toHaveLength(1);
    expect(screen.getByText('Créneaux du matin')).toBeInTheDocument();
  });

  it('pas d annonce épinglée → pas de hero, annonces en liste', async () => {
    mocked.getClubAnnouncements.mockResolvedValue([regular] as never);
    wrap();
    expect(await screen.findByText('Créneaux du matin')).toBeInTheDocument();
    expect(screen.queryByText('À la une')).not.toBeInTheDocument();
  });

  it('créneau libre à venir → bloc « À saisir » avec lien profond', async () => {
    const future = new Date(Date.now() + 2 * 3600e3).toISOString();
    mocked.getClubAvailability.mockResolvedValue([{
      resource: { id: 'court-1', name: 'Terrain 1' },
      slots: [{ startTime: future, endTime: future, available: true, pricePerHour: '25', offPeak: false }],
    }] as never);
    wrap();
    expect(await screen.findByText(/À saisir aujourd/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Réserver' }).getAttribute('href')).toContain('resource=court-1');
  });

  it('aucune dispo → bloc « À saisir » masqué', async () => {
    mocked.getClubAnnouncements.mockResolvedValue([regular] as never);
    wrap();
    await screen.findByText('Créneaux du matin');
    expect(screen.queryByText(/À saisir aujourd/)).not.toBeInTheDocument();
  });

  it('tournoi publié à venir → bloc « Prochains events »', async () => {
    mocked.getClubTournaments.mockResolvedValue([{
      id: 't1', name: 'P100 Messieurs', category: 'P100', gender: 'MEN', startTime: new Date(Date.now() + 7 * 86400e3).toISOString(),
      status: 'PUBLISHED', maxTeams: 16, confirmedCount: 14, waitlistCount: 0,
    }] as never);
    wrap();
    expect(await screen.findByText('P100 Messieurs')).toBeInTheDocument();
    expect(screen.getByText('Prochains events')).toBeInTheDocument();
    expect(screen.getByText('Plus que 2 places')).toBeInTheDocument();
  });

  it('animation publiée à venir → fusionnée dans « Prochains events »', async () => {
    mocked.getClubEvents.mockResolvedValue([{
      id: 'e1', name: 'Mêlée du vendredi', kind: 'MELEE', startTime: new Date(Date.now() + 2 * 86400e3).toISOString(),
      status: 'PUBLISHED', capacity: 12, confirmedCount: 4, waitlistCount: 0,
    }] as never);
    wrap();
    expect(await screen.findByText('Mêlée du vendredi')).toBeInTheDocument();
    expect(screen.getByText('Mêlée du vendredi').closest('a')).toHaveAttribute('href', '/events/e1');
  });
});
