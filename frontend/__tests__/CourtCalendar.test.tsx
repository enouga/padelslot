import { render, screen, fireEvent } from '@testing-library/react';
import CourtCalendar from '../components/CourtCalendar';
import { ThemeProvider } from '../lib/ThemeProvider';
import { TimeSlot } from '../lib/api';

const mockSlots: TimeSlot[] = [
  { startTime: '2025-06-15T06:00:00.000Z', endTime: '2025-06-15T07:00:00.000Z', available: true, pricePerHour: '25', totalPrice: '25.00', offPeak: false },
  { startTime: '2025-06-15T06:30:00.000Z', endTime: '2025-06-15T07:30:00.000Z', available: false, pricePerHour: '25', totalPrice: '25.00', offPeak: false },
  { startTime: '2025-06-15T07:00:00.000Z', endTime: '2025-06-15T08:00:00.000Z', available: true, pricePerHour: '25', totalPrice: '25.00', offPeak: false },
];

function renderCal(props: Partial<React.ComponentProps<typeof CourtCalendar>> = {}) {
  return render(
    <ThemeProvider>
      <CourtCalendar slots={mockSlots} onSelectSlot={jest.fn()} selectedSlot={null} {...props} />
    </ThemeProvider>
  );
}

describe('CourtCalendar', () => {
  it('rend les créneaux libres comme boutons et les pris comme indisponibles', () => {
    renderCal();
    expect(screen.getAllByRole('button', { name: /Réserver/ })).toHaveLength(2);
    expect(screen.getByText('Réservé')).toBeInTheDocument();
  });

  it('appelle onSelectSlot avec le créneau cliqué', () => {
    const onSelect = jest.fn();
    renderCal({ onSelectSlot: onSelect });
    fireEvent.click(screen.getAllByRole('button', { name: /Réserver/ })[0]);
    expect(onSelect).toHaveBeenCalledWith(mockSlots[0]);
  });

  it('marque le créneau sélectionné (ring-2 + aria-pressed)', () => {
    renderCal({ selectedSlot: mockSlots[0] });
    const buttons = screen.getAllByRole('button', { name: /Réserver/ });
    expect(buttons[0]).toHaveClass('ring-2');
    expect(buttons[0]).toHaveAttribute('aria-pressed', 'true');
  });
});
