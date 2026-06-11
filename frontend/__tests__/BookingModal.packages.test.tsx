import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import BookingModal from '../components/BookingModal';
import { ThemeProvider } from '../lib/ThemeProvider';
import { api, TimeSlot, MemberPackage } from '../lib/api';

jest.mock('../lib/api', () => ({
  api: {
    holdSlot:           jest.fn(),
    confirmReservation: jest.fn(),
    cancelReservation:  jest.fn(),
  },
}));

const mockSlot: TimeSlot = {
  startTime: '2026-06-15T06:00:00.000Z',
  endTime:   '2026-06-15T07:00:00.000Z',
  available: true,
  pricePerHour: '25',
  totalPrice: '25.00',
  offPeak: false,
};

const pkg: MemberPackage = {
  id: 'pkg-1', kind: 'ENTRIES', creditsTotal: 10, creditsRemaining: 7,
  amountTotal: null, amountRemaining: null, purchasedAt: '2026-06-01T00:00:00Z',
  expiresAt: null, template: { name: '10 entrées' },
};

async function openPending(packages: MemberPackage[]) {
  (api.holdSlot as jest.Mock).mockResolvedValue({ id: 'res-1', status: 'PENDING', totalPrice: '25' });
  render(
    <ThemeProvider>
      <BookingModal
        slot={mockSlot}
        resourceId="court-1"
        pricePerHour="25"
        duration={60}
        token="jwt-token"
        packages={packages}
        onClose={jest.fn()}
        onConfirmed={jest.fn()}
      />
    </ThemeProvider>,
  );
  fireEvent.click(screen.getByRole('button', { name: /Pré-réserver/ }));
  await screen.findByText(/Confirmez dans/);
}

describe('BookingModal — paiement par carnet', () => {
  beforeEach(() => jest.clearAllMocks());

  it('propose le carnet en phase pending et confirme avec paymentSource', async () => {
    (api.confirmReservation as jest.Mock).mockResolvedValue({ id: 'res-1', status: 'CONFIRMED' });
    await openPending([pkg]);

    fireEvent.click(screen.getByRole('button', { name: /Carnet — 7 entrées/ }));
    fireEvent.click(screen.getByRole('button', { name: /Confirmer avec mon solde/ }));

    await waitFor(() => {
      expect(api.confirmReservation).toHaveBeenCalledWith('res-1', 'jwt-token', { packageId: 'pkg-1' });
    });
  });

  it('confirme sans paymentSource si « Régler au club » reste sélectionné', async () => {
    (api.confirmReservation as jest.Mock).mockResolvedValue({ id: 'res-1', status: 'CONFIRMED' });
    await openPending([pkg]);

    expect(screen.getByRole('button', { name: /Régler au club/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Confirmer et payer/ }));

    await waitFor(() => {
      expect(api.confirmReservation).toHaveBeenCalledWith('res-1', 'jwt-token', undefined);
    });
  });

  it('solde insuffisant : reste en pending, message affiché, retombe sur « Régler au club »', async () => {
    (api.confirmReservation as jest.Mock).mockRejectedValueOnce(new Error('INSUFFICIENT_BALANCE'));
    await openPending([pkg]);

    fireEvent.click(screen.getByRole('button', { name: /Carnet — 7 entrées/ }));
    fireEvent.click(screen.getByRole('button', { name: /Confirmer avec mon solde/ }));

    expect(await screen.findByText(/Solde insuffisant/)).toBeInTheDocument();
    // toujours en phase pending : le bouton de confirmation standard est revenu
    expect(screen.getByRole('button', { name: /Confirmer et payer/ })).toBeInTheDocument();
  });
});
