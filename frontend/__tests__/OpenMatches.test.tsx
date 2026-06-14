import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { OpenMatches } from '../components/openmatch/OpenMatches';
import { ThemeProvider } from '../lib/ThemeProvider';

jest.mock('next/navigation', () => ({
  usePathname: () => '/parties',
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
}));
jest.mock('../lib/api', () => ({
  assetUrl: (p: string | null) => p,
  api: {
    getMyMemberships: jest.fn().mockResolvedValue([]),
    // Chargé au montage par ProfileMenu (info-bulle d'identité dans le header) ; menu jamais ouvert ici.
    getMyProfile:     jest.fn().mockResolvedValue({ firstName: 'Test', lastName: 'User', email: 'test@palova.fr', avatarUrl: null }),
    getOpenMatches:   jest.fn(),
    joinOpenMatch:    jest.fn().mockResolvedValue({ id: 'm1' }),
    leaveOpenMatch:   jest.fn().mockResolvedValue({ id: 'm1' }),
    removeOpenMatchPlayer: jest.fn().mockResolvedValue({ id: 'm1' }),
  },
}));
import { api } from '../lib/api';
const mocked = api as jest.Mocked<typeof api>;

const club = { id: 'c1', slug: 'demo', name: 'Club Démo', timezone: 'Europe/Paris' } as never;
const future = new Date(Date.now() + 48 * 3600e3).toISOString();

const match = (over: Record<string, unknown> = {}) => ({
  id: 'm1', resourceName: 'Terrain 1', startTime: future, endTime: future,
  maxPlayers: 4, spotsLeft: 2, full: false, viewerIsParticipant: false, viewerIsOrganizer: false,
  players: [{ userId: 'u-org', firstName: 'Org', lastName: 'A', avatarUrl: null, isOrganizer: true }],
  ...over,
});

describe('OpenMatches', () => {
  beforeEach(() => { document.cookie = 'token=abc; path=/'; jest.clearAllMocks(); });
  afterEach(() => { document.cookie = 'token=; max-age=0; path=/'; });

  it('liste les parties et permet de rejoindre', async () => {
    mocked.getOpenMatches.mockResolvedValue([match()] as never);
    render(<ThemeProvider><OpenMatches club={club} /></ThemeProvider>);

    expect(await screen.findByText('Terrain 1')).toBeInTheDocument();
    expect(screen.getByText('2 places')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Rejoindre/ }));
    await waitFor(() => expect(mocked.joinOpenMatch).toHaveBeenCalledWith('demo', 'm1', 'abc'));
  });

  it('affiche « Quitter » pour un participant non-organisateur', async () => {
    mocked.getOpenMatches.mockResolvedValue([match({ viewerIsParticipant: true })] as never);
    render(<ThemeProvider><OpenMatches club={club} /></ThemeProvider>);

    fireEvent.click(await screen.findByRole('button', { name: /Quitter/ }));
    await waitFor(() => expect(mocked.leaveOpenMatch).toHaveBeenCalledWith('demo', 'm1', 'abc'));
  });

  it('masque les actions et affiche « Vous organisez » pour l organisateur', async () => {
    mocked.getOpenMatches.mockResolvedValue([match({ viewerIsParticipant: true, viewerIsOrganizer: true })] as never);
    render(<ThemeProvider><OpenMatches club={club} /></ThemeProvider>);

    expect(await screen.findByText('Vous organisez')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Rejoindre|Quitter/ })).not.toBeInTheDocument();
  });

  it('désactive « Rejoindre » quand la partie est complète', async () => {
    mocked.getOpenMatches.mockResolvedValue([match({ full: true, spotsLeft: 0 })] as never);
    render(<ThemeProvider><OpenMatches club={club} /></ThemeProvider>);

    expect(await screen.findByText('Complet')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Rejoindre/ })).toBeDisabled();
  });

  it('permet à l organisateur de retirer un joueur non-organisateur', async () => {
    const players = [
      { userId: 'u-org', firstName: 'Org', lastName: 'A', avatarUrl: null, isOrganizer: true },
      { userId: 'u-emma', firstName: 'Emma', lastName: 'Bernard', avatarUrl: null, isOrganizer: false },
    ];
    mocked.getOpenMatches.mockResolvedValue([match({ viewerIsOrganizer: true, players, spotsLeft: 1 })] as never);
    render(<ThemeProvider><OpenMatches club={club} /></ThemeProvider>);

    expect(await screen.findByText('Emma Bernard')).toBeInTheDocument();
    const remove = await screen.findByRole('button', { name: /Retirer Emma Bernard/ });
    fireEvent.click(remove);
    await waitFor(() => expect(mocked.removeOpenMatchPlayer).toHaveBeenCalledWith('demo', 'm1', 'u-emma', 'abc'));
  });

  it('masque le bouton « Retirer » quand le viewer n est pas l organisateur', async () => {
    const players = [
      { userId: 'u-org', firstName: 'Org', lastName: 'A', avatarUrl: null, isOrganizer: true },
      { userId: 'u-emma', firstName: 'Emma', lastName: 'Bernard', avatarUrl: null, isOrganizer: false },
    ];
    mocked.getOpenMatches.mockResolvedValue([match({ viewerIsOrganizer: false, players, spotsLeft: 1 })] as never);
    render(<ThemeProvider><OpenMatches club={club} /></ThemeProvider>);

    expect(await screen.findByText('Emma Bernard')).toBeInTheDocument();
    expect(screen.queryByLabelText('Retirer Emma Bernard')).not.toBeInTheDocument();
  });
});
