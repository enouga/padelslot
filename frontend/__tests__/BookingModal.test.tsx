import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import BookingModal from '../components/BookingModal';
import { ThemeProvider } from '../lib/ThemeProvider';
import { api, TimeSlot } from '../lib/api';

jest.mock('../lib/api', () => ({
  api: {
    holdSlot:           jest.fn(),
    confirmReservation: jest.fn(),
    cancelReservation:  jest.fn(),
  },
}));

const mockSlot: TimeSlot = {
  startTime: '2025-06-15T06:00:00.000Z',
  endTime:   '2025-06-15T07:00:00.000Z',
  available: true,
  pricePerHour: '25',
  totalPrice: '25.00',
  offPeak: false,
};

function renderModal(overrides: Partial<React.ComponentProps<typeof BookingModal>> = {}) {
  return render(
    <ThemeProvider>
      <BookingModal
        slot={mockSlot}
        resourceId="court-1"
        pricePerHour="25"
        duration={60}
        token="jwt-token"
        onClose={jest.fn()}
        onConfirmed={jest.fn()}
        {...overrides}
      />
    </ThemeProvider>
  );
}

describe('BookingModal', () => {
  beforeEach(() => jest.clearAllMocks());

  it('appelle holdSlot et affiche le countdown après clic Pré-réserver', async () => {
    (api.holdSlot as jest.Mock).mockResolvedValue({ id: 'res-1', status: 'PENDING', totalPrice: '25' });

    renderModal();
    fireEvent.click(screen.getByRole('button', { name: /Pré-réserver/ }));

    await waitFor(() =>
      expect(api.holdSlot).toHaveBeenCalledWith(
        { resourceId: 'court-1', startTime: mockSlot.startTime, endTime: mockSlot.endTime },
        'jwt-token',
      )
    );
    expect(await screen.findByText(/Confirmez dans/)).toBeInTheDocument();
  });

  it('appelle confirmReservation et onConfirmed après confirmation finale', async () => {
    (api.holdSlot as jest.Mock).mockResolvedValue({ id: 'res-1', status: 'PENDING', totalPrice: '25' });
    (api.confirmReservation as jest.Mock).mockResolvedValue({ id: 'res-1', status: 'CONFIRMED' });

    const onConfirmed = jest.fn();
    renderModal({ onConfirmed });

    fireEvent.click(screen.getByRole('button', { name: /Pré-réserver/ }));
    await screen.findByText(/Confirmez dans/);
    fireEvent.click(screen.getByRole('button', { name: /Confirmer et payer/ }));

    await waitFor(() => expect(onConfirmed).toHaveBeenCalled());
  });

  it('annule le hold (libère le créneau) au clic Abandonner en phase pending', async () => {
    (api.holdSlot as jest.Mock).mockResolvedValue({ id: 'res-1', status: 'PENDING', totalPrice: '25' });
    (api.cancelReservation as jest.Mock).mockResolvedValue({ id: 'res-1', status: 'CANCELLED' });

    const onClose = jest.fn();
    renderModal({ onClose });

    fireEvent.click(screen.getByRole('button', { name: /Pré-réserver/ }));
    await screen.findByText(/Confirmez dans/);
    fireEvent.click(screen.getByRole('button', { name: /Abandonner/ }));

    await waitFor(() => expect(api.cancelReservation).toHaveBeenCalledWith('res-1', 'jwt-token'));
    expect(onClose).toHaveBeenCalled();
  });

  it('affiche un message d erreur si holdSlot échoue', async () => {
    (api.holdSlot as jest.Mock).mockRejectedValue(new Error('SLOT_ALREADY_HELD'));

    renderModal();
    fireEvent.click(screen.getByRole('button', { name: /Pré-réserver/ }));

    await waitFor(() => expect(screen.getByText(/vient d'être pris/)).toBeInTheDocument());
  });
});
