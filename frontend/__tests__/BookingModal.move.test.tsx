import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import BookingModal from '../components/BookingModal';
import { ThemeProvider } from '../lib/ThemeProvider';

jest.mock('../lib/api', () => ({
  api: {
    holdSlot: jest.fn(),
    confirmReservation: jest.fn(),
    cancelReservation: jest.fn(),
    rescheduleReservation: jest.fn(),
  },
}));
import { api } from '../lib/api';
const mocked = api as jest.Mocked<typeof api>;

const slot = {
  startTime: '2026-06-16T10:00:00.000Z',
  endTime: '2026-06-16T11:30:00.000Z',
  available: true,
  pricePerHour: '25',
  totalPrice: '37.50',
  offPeak: false,
};

function renderModal(props: Partial<React.ComponentProps<typeof BookingModal>> = {}) {
  return render(
    <ThemeProvider>
      <BookingModal
        slot={slot} resourceId="court-2" pricePerHour="25" duration={90}
        token="abc" timezone="Europe/Paris"
        onClose={jest.fn()} onConfirmed={jest.fn()} {...props}
      />
    </ThemeProvider>,
  );
}

describe('BookingModal — mode déplacement', () => {
  beforeEach(() => jest.clearAllMocks());

  it('« Déplacer ici » appelle rescheduleReservation (jamais hold/confirm) puis onConfirmed', async () => {
    const onConfirmed = jest.fn();
    const moved = { id: 'res-new' };
    mocked.rescheduleReservation.mockResolvedValue(moved as never);
    renderModal({ moveReservationId: 'res-1', onConfirmed });

    fireEvent.click(screen.getByRole('button', { name: /Déplacer ici/ }));

    await waitFor(() => expect(onConfirmed).toHaveBeenCalledWith(moved));
    expect(mocked.rescheduleReservation).toHaveBeenCalledWith(
      'res-1',
      { resourceId: 'court-2', startTime: slot.startTime, duration: 90 },
      'abc',
    );
    expect(mocked.holdSlot).not.toHaveBeenCalled();
    expect(mocked.confirmReservation).not.toHaveBeenCalled();
  });

  it('explique que l ancienne réservation sera remplacée (pas de blocage 10 min)', () => {
    renderModal({ moveReservationId: 'res-1' });
    expect(screen.getByText(/annulée et remplacée/)).toBeInTheDocument();
    expect(screen.queryByText(/10 minutes/)).toBeNull();
  });

  it('fermer en mode déplacement n annule jamais rien', () => {
    const onClose = jest.fn();
    renderModal({ moveReservationId: 'res-1', onClose });
    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(onClose).toHaveBeenCalled();
    expect(mocked.cancelReservation).not.toHaveBeenCalled();
  });

  it('affiche une erreur dédiée quand le créneau vient d être pris', async () => {
    mocked.rescheduleReservation.mockRejectedValue(new Error('SLOT_NOT_AVAILABLE'));
    renderModal({ moveReservationId: 'res-1' });
    fireEvent.click(screen.getByRole('button', { name: /Déplacer ici/ }));
    expect(await screen.findByText(/vient d'être pris/)).toBeInTheDocument();
  });

  it('sans moveReservationId, le flux hold + confirmation reste inchangé', async () => {
    mocked.holdSlot.mockResolvedValue({ id: 'res-hold' } as never);
    renderModal();
    fireEvent.click(screen.getByRole('button', { name: /Pré-réserver/ }));
    await waitFor(() => expect(mocked.holdSlot).toHaveBeenCalled());
    expect(mocked.rescheduleReservation).not.toHaveBeenCalled();
  });
});
