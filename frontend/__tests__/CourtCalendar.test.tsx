import { render, screen, fireEvent } from '@testing-library/react';
import CourtCalendar from '../components/CourtCalendar';
import { TimeSlot } from '../lib/api';

const mockSlots: TimeSlot[] = [
  { startTime: '2025-06-15T06:00:00.000Z', endTime: '2025-06-15T07:00:00.000Z', available: true },
  { startTime: '2025-06-15T06:30:00.000Z', endTime: '2025-06-15T07:30:00.000Z', available: false },
  { startTime: '2025-06-15T07:00:00.000Z', endTime: '2025-06-15T08:00:00.000Z', available: true },
];

describe('CourtCalendar', () => {
  it('affiche les créneaux avec la bonne couleur', () => {
    render(
      <CourtCalendar
        slots={mockSlots}
        onSelectSlot={jest.fn()}
        selectedSlot={null}
      />
    );

    const available = screen.getAllByRole('button', { name: /Réserver/ });
    expect(available).toHaveLength(2);

    const unavailable = screen.getByText('Indisponible');
    expect(unavailable).toBeInTheDocument();
  });

  it('appelle onSelectSlot avec le créneau cliqué', () => {
    const onSelect = jest.fn();
    render(
      <CourtCalendar slots={mockSlots} onSelectSlot={onSelect} selectedSlot={null} />
    );

    fireEvent.click(screen.getAllByRole('button', { name: /Réserver/ })[0]);
    expect(onSelect).toHaveBeenCalledWith(mockSlots[0]);
  });

  it('applique ring-2 sur le créneau sélectionné', () => {
    render(
      <CourtCalendar
        slots={mockSlots}
        onSelectSlot={jest.fn()}
        selectedSlot={mockSlots[0]}
      />
    );

    const buttons = screen.getAllByRole('button', { name: /Réserver/ });
    expect(buttons[0]).toHaveClass('ring-2');
  });
});
