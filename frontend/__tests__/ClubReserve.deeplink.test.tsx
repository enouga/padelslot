import { render, screen } from '@testing-library/react';
import { ClubReserve } from '../components/ClubReserve';
import { ThemeProvider } from '../lib/ThemeProvider';

// Lendemain midi UTC : déterministe (pas de chevauchement de minuit) et dans la fenêtre de résa.
const start = (() => { const d = new Date(Date.now() + 24 * 3600e3); d.setUTCHours(12, 0, 0, 0); return d.toISOString(); })();

jest.mock('next/navigation', () => ({
  usePathname: () => '/reserver',
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
}));
jest.mock('../components/BookingModal', () => ({
  __esModule: true,
  default: ({ resourceId }: { resourceId: string }) => <div data-testid="booking-modal">{resourceId}</div>,
}));
jest.mock('../lib/api', () => ({
  api: {
    getMyMemberships: jest.fn().mockResolvedValue([]),
    getMyClubPackages: jest.fn().mockResolvedValue([]),
    getClubAvailability: jest.fn(),
  },
}));
import { api } from '../lib/api';
const mocked = api as jest.Mocked<typeof api>;

const club = {
  id: 'c1', slug: 'demo', name: 'Club Démo', timezone: 'Europe/Paris', description: null,
  memberBookingDays: 7, publicBookingDays: 7,
  clubSports: [{ id: 'cs1', durationsMin: [90], sport: { defaultDurationsMin: [90], name: 'Padel', icon: null }, resources: [] }],
} as never;

const availability = [{
  resource: { id: 'court-1', name: 'Terrain 1', attributes: {}, pricePerHour: '25', offPeakPricePerHour: null, sport: { key: 'padel', name: 'Padel' }, clubSportId: 'cs1' },
  slots: [{ startTime: start, endTime: start, available: true, pricePerHour: '25', offPeak: false }],
}];

describe('ClubReserve — lien profond', () => {
  beforeEach(() => {
    document.cookie = 'token=abc; path=/';
    mocked.getClubAvailability.mockResolvedValue(availability as never);
  });
  afterEach(() => { document.cookie = 'token=; max-age=0; path=/'; });

  it('?resource=&start= pré-ouvre la confirmation quand le créneau est libre', async () => {
    window.history.pushState({}, '', `/reserver?resource=court-1&start=${encodeURIComponent(start)}`);
    render(<ThemeProvider><ClubReserve club={club} /></ThemeProvider>);
    expect(await screen.findByTestId('booking-modal')).toHaveTextContent('court-1');
  });

  it('créneau pris entre-temps → page normale, sans modale ni erreur', async () => {
    mocked.getClubAvailability.mockResolvedValue([{
      ...availability[0],
      slots: [{ startTime: start, endTime: start, available: false, pricePerHour: '25', offPeak: false }],
    }] as never);
    window.history.pushState({}, '', `/reserver?resource=court-1&start=${encodeURIComponent(start)}`);
    render(<ThemeProvider><ClubReserve club={club} /></ThemeProvider>);
    expect(await screen.findByText('Terrain 1')).toBeInTheDocument();
    expect(screen.queryByTestId('booking-modal')).not.toBeInTheDocument();
  });
});
