import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ClubReserve } from '../components/ClubReserve';
import { ThemeProvider } from '../lib/ThemeProvider';
import { dayKeyInTz } from '../lib/calendar';

// Lendemain midi UTC : déterministe et toujours dans la fenêtre de résa.
const start = (() => { const d = new Date(Date.now() + 24 * 3600e3); d.setUTCHours(12, 0, 0, 0); return d; })();
const startISO = start.toISOString();
const endISO = new Date(start.getTime() + 3600e3).toISOString();

const replaceMock = jest.fn();
jest.mock('next/navigation', () => ({
  usePathname: () => '/reserver',
  useRouter: () => ({ push: jest.fn(), replace: replaceMock, back: jest.fn() }),
}));
jest.mock('../components/BookingModal', () => ({
  __esModule: true,
  default: ({ moveReservationId }: { moveReservationId?: string }) => (
    <div data-testid="booking-modal">{moveReservationId ?? 'no-move'}</div>
  ),
}));
jest.mock('../lib/api', () => ({
  assetUrl: (p: string | null) => p,
  api: {
    getMyMemberships: jest.fn().mockResolvedValue([]),
    getMyClubPackages: jest.fn().mockResolvedValue([]),
    getClubAvailability: jest.fn(),
    getMyReservations: jest.fn(),
  },
}));
import { api } from '../lib/api';
const mocked = api as jest.Mocked<typeof api>;

const club = {
  id: 'c1', slug: 'demo', name: 'Club Démo', timezone: 'Europe/Paris', description: null,
  memberBookingDays: 7, publicBookingDays: 7,
  clubSports: [{ id: 'cs1', durationsMin: [60, 90], sport: { defaultDurationsMin: [60, 90], name: 'Padel', icon: null }, resources: [] }],
} as never;

const availability = [{
  resource: { id: 'court-1', name: 'Terrain 1', attributes: {}, price: '25', offPeakPrice: null, sport: { key: 'padel', name: 'Padel' }, clubSportId: 'cs1' },
  slots: [{ startTime: startISO, endTime: endISO, available: true, price: '25', offPeak: false }],
}];

const myReservation = {
  id: 'res-1',
  startTime: startISO,
  endTime: endISO,
  status: 'CONFIRMED',
  totalPrice: '25.00',
  resource: { id: 'court-1', name: 'Terrain 1', club: { name: 'Club Démo', slug: 'demo', timezone: 'Europe/Paris' } },
};

describe('ClubReserve — mode déplacement (?move=)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    document.cookie = 'token=abc; path=/';
    mocked.getClubAvailability.mockResolvedValue(availability as never);
    mocked.getMyReservations.mockResolvedValue([myReservation] as never);
  });
  afterEach(() => { document.cookie = 'token=; max-age=0; path=/'; });

  it('affiche le bandeau de déplacement et pré-sélectionne la date et la durée de la résa', async () => {
    window.history.pushState({}, '', '/reserver?move=res-1');
    render(<ThemeProvider><ClubReserve club={club} /></ThemeProvider>);

    expect(await screen.findByText(/Déplacement/)).toBeInTheDocument();
    expect(screen.getAllByText(/Terrain 1/).length).toBeGreaterThan(0);
    // dispos rechargées pour le jour de la résa, avec sa durée (60 min)
    await waitFor(() => expect(mocked.getClubAvailability).toHaveBeenCalledWith(
      'demo', dayKeyInTz(startISO, 'Europe/Paris'), 60,
    ));
  });

  it('un clic sur un créneau ouvre la modale en mode déplacement', async () => {
    window.history.pushState({}, '', '/reserver?move=res-1');
    render(<ThemeProvider><ClubReserve club={club} /></ThemeProvider>);
    await screen.findByText(/Déplacement/);

    fireEvent.click(await screen.findByRole('button', { name: /14h00/ })); // 12h UTC = 14h Paris
    expect(await screen.findByTestId('booking-modal')).toHaveTextContent('res-1');
  });

  it('« Abandonner » retire le bandeau et nettoie l URL', async () => {
    window.history.pushState({}, '', '/reserver?move=res-1');
    render(<ThemeProvider><ClubReserve club={club} /></ThemeProvider>);
    await screen.findByText(/Déplacement/);

    fireEvent.click(screen.getByRole('button', { name: 'Abandonner' }));
    expect(screen.queryByText(/Déplacement/)).toBeNull();
    expect(replaceMock).toHaveBeenCalledWith('/reserver');
  });

  it('id inconnu ou résa d un autre club → page normale sans bandeau', async () => {
    mocked.getMyReservations.mockResolvedValue([] as never);
    window.history.pushState({}, '', '/reserver?move=res-inconnu');
    render(<ThemeProvider><ClubReserve club={club} /></ThemeProvider>);

    expect(await screen.findByText('Terrain 1')).toBeInTheDocument();
    expect(screen.queryByText(/Déplacement/)).toBeNull();
  });
});
