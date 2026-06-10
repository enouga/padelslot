import { render, screen, fireEvent } from '@testing-library/react';
import { MonthCalendar } from '../components/calendar/MonthCalendar';
import { ThemeProvider } from '../lib/ThemeProvider';
import { buildCalendarEntries, entriesByDay } from '../lib/calendar';
import { MyReservation, MyTournamentRegistration } from '../lib/api';

const reservation: MyReservation = {
  id: 'res-1',
  startTime: '2026-06-12T16:00:00.000Z',
  endTime: '2026-06-12T17:00:00.000Z',
  status: 'CONFIRMED',
  totalPrice: '25.00',
  resource: { id: 'court-1', name: 'Court 1', club: { name: 'Padel Arena', slug: 'padel-arena', timezone: 'Europe/Paris' } },
};

const registration = {
  id: 'reg-1',
  status: 'CONFIRMED',
  createdAt: '2026-06-01T10:00:00.000Z',
  captain: { id: 'u1', firstName: 'Eric', lastName: 'N', email: 'e@x.fr', phone: null },
  partner: { id: 'u2', firstName: 'Marc', lastName: 'D', email: 'm@x.fr', phone: null },
  captainLicense: null,
  partnerLicense: null,
  tournament: {
    id: 't-1', clubId: 'club-demo', clubSportId: 'cs-1', name: 'P100 Messieurs', category: 'P100',
    gender: 'MEN', description: null,
    startTime: '2026-06-13T07:00:00.000Z', endTime: '2026-06-14T16:00:00.000Z',
    registrationDeadline: '2026-06-11T22:00:00.000Z', maxTeams: 16, entryFee: null,
    status: 'PUBLISHED', confirmedCount: 4, waitlistCount: 0,
    club: { slug: 'padel-arena', name: 'Padel Arena', timezone: 'Europe/Paris' },
  },
} as MyTournamentRegistration;

const byDay = entriesByDay(buildCalendarEntries([reservation], [registration], new Date('2026-06-10T12:00:00.000Z')));

function renderCal(props: Partial<React.ComponentProps<typeof MonthCalendar>> = {}) {
  return render(
    <ThemeProvider>
      <MonthCalendar
        year={2026} month={6} byDay={byDay} selected={null} todayKey="2026-06-10"
        onSelect={jest.fn()} onNavigate={jest.fn()} {...props}
      />
    </ThemeProvider>,
  );
}

describe('MonthCalendar', () => {
  it('affiche le libellé du mois et la grille des jours', () => {
    const { container } = renderCal();
    expect(screen.getByText(/juin 2026/i)).toBeInTheDocument();
    expect(container.querySelector('[data-day-key="2026-06-01"]')).toBeInTheDocument();
    expect(container.querySelector('[data-day-key="2026-06-30"]')).toBeInTheDocument();
  });

  it('met une pastille réservation sur le jour concerné', () => {
    const { container } = renderCal();
    const cell = container.querySelector('[data-day-key="2026-06-12"]')!;
    expect(cell.querySelector('[data-marker="reservation"]')).toBeInTheDocument();
  });

  it('étire la barre tournoi sur tous les jours du tournoi', () => {
    const { container } = renderCal();
    for (const key of ['2026-06-13', '2026-06-14']) {
      const cell = container.querySelector(`[data-day-key="${key}"]`)!;
      expect(cell.querySelector('[data-marker="tournament"]')).toBeInTheDocument();
    }
    expect(container.querySelector('[data-day-key="2026-06-15"]')!.querySelector('[data-marker="tournament"]')).toBeNull();
  });

  it('marque aujourd hui et le jour sélectionné', () => {
    const { container } = renderCal({ selected: '2026-06-12' });
    expect(container.querySelector('[data-day-key="2026-06-10"]')).toHaveAttribute('data-today', 'true');
    expect(container.querySelector('[data-day-key="2026-06-12"]')).toHaveAttribute('aria-pressed', 'true');
  });

  it('appelle onSelect avec la clé du jour cliqué', () => {
    const onSelect = jest.fn();
    const { container } = renderCal({ onSelect });
    fireEvent.click(container.querySelector('[data-day-key="2026-06-12"]')!);
    expect(onSelect).toHaveBeenCalledWith('2026-06-12');
  });

  it('navigue de mois en mois avec les chevrons', () => {
    const onNavigate = jest.fn();
    renderCal({ onNavigate });
    fireEvent.click(screen.getByLabelText('Mois précédent'));
    expect(onNavigate).toHaveBeenCalledWith(-1);
    fireEvent.click(screen.getByLabelText('Mois suivant'));
    expect(onNavigate).toHaveBeenCalledWith(1);
  });
});
