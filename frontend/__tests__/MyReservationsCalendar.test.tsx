import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import MyReservationsPage from '../app/me/reservations/page';
import { ThemeProvider } from '../lib/ThemeProvider';
import { dayKeyInTz } from '../lib/calendar';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, replace: jest.fn(), back: jest.fn() }),
  usePathname: () => '/me/reservations',
}));
const pushMock = jest.fn();

jest.mock('../lib/useAuth', () => ({
  useAuth: () => ({ token: 'abc', ready: true, clubId: null }),
  logout: jest.fn(),
}));
jest.mock('../components/ClubNav', () => ({ ClubNav: () => <div data-testid="nav" /> }));
jest.mock('../lib/ClubProvider', () => ({
  useClub: () => ({ slug: 'padel-arena', club: { name: 'Padel Arena' } }),
}));
jest.mock('../lib/api', () => ({
  assetUrl: (p: string | null) => p,
  api: {
    getMyReservations: jest.fn(),
    getMyTournaments: jest.fn(),
    cancelReservation: jest.fn(),
  },
}));
import { api } from '../lib/api';
const mocked = api as jest.Mocked<typeof api>;

// Demain midi UTC : déterministe et toujours « à venir ».
const start = (() => { const d = new Date(Date.now() + 24 * 3600e3); d.setUTCHours(12, 0, 0, 0); return d; })();
const dayKey = dayKeyInTz(start.toISOString(), 'Europe/Paris');

const reservation = {
  id: 'res-1',
  startTime: start.toISOString(),
  endTime: new Date(start.getTime() + 3600e3).toISOString(),
  status: 'CONFIRMED',
  totalPrice: '25.00',
  resource: { id: 'court-1', name: 'Court 1', club: { name: 'Padel Arena', slug: 'padel-arena', timezone: 'Europe/Paris' } },
};

describe('Mes réservations — onglet Calendrier', () => {
  beforeEach(() => {
    pushMock.mockReset();
    mocked.getMyReservations.mockResolvedValue([reservation] as never);
    mocked.getMyTournaments.mockResolvedValue([] as never);
  });

  it('Calendrier est l’onglet par défaut et apparaît en premier', async () => {
    const { container } = render(<ThemeProvider><MyReservationsPage /></ThemeProvider>);
    // Par défaut (sans cliquer), la grille du mois est affichée une fois le chargement fini.
    await waitFor(() => expect(container.querySelector(`[data-day-key="${dayKey}"]`)).toBeInTheDocument());
    // L'onglet Calendrier précède « À venir » dans le Segmented.
    const calendarTab = screen.getByText('Calendrier');
    const upcomingTab = screen.getByText(/À venir/);
    expect(calendarTab.compareDocumentPosition(upcomingTab) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('affiche la grille du mois avec la pastille de la réservation', async () => {
    const { container } = render(<ThemeProvider><MyReservationsPage /></ThemeProvider>);
    fireEvent.click(await screen.findByText('Calendrier'));
    const cell = container.querySelector(`[data-day-key="${dayKey}"]`)!;
    expect(cell).toBeInTheDocument();
    expect(cell.querySelector('[data-marker="reservation"]')).toBeInTheDocument();
  });

  it('clic sur le jour → carte de la résa ; « Annuler » ouvre le ConfirmDialog existant', async () => {
    const { container } = render(<ThemeProvider><MyReservationsPage /></ThemeProvider>);
    fireEvent.click(await screen.findByText('Calendrier'));
    fireEvent.click(container.querySelector(`[data-day-key="${dayKey}"]`)!);
    expect(await screen.findByText('Court 1')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(await screen.findByText('Annuler la réservation ?')).toBeInTheDocument();
  });

  it('« Déplacer » navigue vers la page Réserver en mode déplacement', async () => {
    const { container } = render(<ThemeProvider><MyReservationsPage /></ThemeProvider>);
    fireEvent.click(await screen.findByText('Calendrier'));
    fireEvent.click(container.querySelector(`[data-day-key="${dayKey}"]`)!);
    fireEvent.click(await screen.findByRole('button', { name: 'Déplacer' }));
    expect(pushMock).toHaveBeenCalledWith('/reserver?move=res-1');
  });
});
