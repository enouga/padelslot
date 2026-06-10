import { render, screen, fireEvent } from '@testing-library/react';
import { DayPanel } from '../components/calendar/DayPanel';
import { ThemeProvider } from '../lib/ThemeProvider';
import { buildCalendarEntries } from '../lib/calendar';
import { MyReservation, MyTournamentRegistration } from '../lib/api';

const reservation: MyReservation = {
  id: 'res-1',
  startTime: '2026-06-12T16:00:00.000Z',
  endTime: '2026-06-12T17:30:00.000Z',
  status: 'CONFIRMED',
  totalPrice: '37.50',
  resource: { id: 'court-1', name: 'Court 1', club: { name: 'Padel Arena', slug: 'padel-arena', timezone: 'Europe/Paris' } },
};

const registration = {
  id: 'reg-1',
  status: 'CONFIRMED',
  createdAt: '2026-06-01T10:00:00.000Z',
  captain: { id: 'u1', firstName: 'Eric', lastName: 'N', email: 'e@x.fr', phone: null },
  partner: { id: 'u2', firstName: 'Marc', lastName: 'Dupont', email: 'm@x.fr', phone: null },
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

const NOW = new Date('2026-06-10T12:00:00.000Z');
const entries = buildCalendarEntries([reservation], [registration], NOW);

function renderPanel(props: Partial<React.ComponentProps<typeof DayPanel>> = {}) {
  return render(
    <ThemeProvider>
      <DayPanel
        dayKey="2026-06-12" entries={entries}
        canMove={() => true} onMove={jest.fn()} onCancel={jest.fn()}
        onReserve={jest.fn()} reserveLabel="Réserver un créneau" {...props}
      />
    </ThemeProvider>,
  );
}

describe('DayPanel', () => {
  it('affiche la carte réservation avec terrain, horaires et prix', () => {
    renderPanel();
    expect(screen.getByText('Court 1')).toBeInTheDocument();
    expect(screen.getByText(/18h00/)).toBeInTheDocument(); // 16h UTC = 18h Paris
    expect(screen.getByText(/37.5/)).toBeInTheDocument();
  });

  it('déclenche onMove et onCancel depuis la carte réservation', () => {
    const onMove = jest.fn();
    const onCancel = jest.fn();
    renderPanel({ onMove, onCancel });
    fireEvent.click(screen.getByRole('button', { name: 'Déplacer' }));
    expect(onMove).toHaveBeenCalledWith(reservation);
    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(onCancel).toHaveBeenCalledWith(reservation);
  });

  it('masque « Déplacer » quand canMove est faux mais garde « Annuler »', () => {
    renderPanel({ canMove: () => false });
    expect(screen.queryByRole('button', { name: 'Déplacer' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Annuler' })).toBeInTheDocument();
  });

  it('affiche la carte tournoi avec un lien Gérer vers la page du tournoi', () => {
    renderPanel();
    expect(screen.getByText('P100 Messieurs')).toBeInTheDocument();
    expect(screen.getByText(/Marc Dupont/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Gérer/ })).toHaveAttribute('href', '/tournois/t-1');
  });

  it('jour vide : message + bouton réserver', () => {
    const onReserve = jest.fn();
    renderPanel({ entries: [], onReserve });
    expect(screen.getByText(/Rien ce jour-là/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Réserver un créneau' }));
    expect(onReserve).toHaveBeenCalled();
  });

  it('ne propose pas d actions sur une réservation passée', () => {
    const pastRes = { ...reservation, startTime: '2026-06-01T16:00:00.000Z', endTime: '2026-06-01T17:00:00.000Z' };
    renderPanel({ entries: buildCalendarEntries([pastRes], [], NOW) });
    expect(screen.queryByRole('button', { name: 'Déplacer' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Annuler' })).toBeNull();
  });
});
