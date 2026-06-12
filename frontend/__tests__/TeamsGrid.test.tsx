import { render, screen } from '@testing-library/react';
import { TeamsGrid } from '../components/tournament/TeamsGrid';
import { ThemeProvider } from '../lib/ThemeProvider';
import { TournamentParticipant } from '../lib/api';

jest.mock('../lib/api', () => ({
  assetUrl: (p: string | null) => p,
  api: {},
}));

const team = (id: string, status: 'CONFIRMED' | 'WAITLISTED', capAvatar: string | null = null): TournamentParticipant => ({
  id, status,
  captain: { firstName: 'Thomas', lastName: 'Fournier', avatarUrl: capAvatar },
  partner: { firstName: 'Maxime', lastName: 'Girard', avatarUrl: null },
});

const wrap = (ui: React.ReactElement) => render(<ThemeProvider>{ui}</ThemeProvider>);

describe('TeamsGrid', () => {
  it('chargement puis liste vide', () => {
    wrap(<TeamsGrid participants={null} />);
    expect(screen.getByText('Chargement…')).toBeInTheDocument();
    wrap(<TeamsGrid participants={[]} />);
    expect(screen.getByText(/Aucun inscrit/)).toBeInTheDocument();
  });

  it('sections Confirmés / Liste d attente avec compteurs', () => {
    wrap(<TeamsGrid participants={[team('r1', 'CONFIRMED'), team('r2', 'WAITLISTED'), team('r3', 'WAITLISTED')]} />);
    expect(screen.getByText('Confirmés (1)')).toBeInTheDocument();
    expect(screen.getByText("Liste d'attente (2)")).toBeInTheDocument();
    expect(screen.getByText('Attente · n°1')).toBeInTheDocument();
    expect(screen.getByText('Attente · n°2')).toBeInTheDocument();
  });

  it('photo quand avatarUrl, initiales sinon', () => {
    wrap(<TeamsGrid participants={[team('r1', 'CONFIRMED', '/uploads/avatars/t.jpg')]} />);
    expect(screen.getByAltText('Thomas Fournier')).toHaveAttribute('src', '/uploads/avatars/t.jpg');
    expect(screen.getByText('MG')).toBeInTheDocument(); // initiales du partenaire sans photo
  });

  it('surligne mon équipe', () => {
    wrap(<TeamsGrid participants={[team('r1', 'CONFIRMED'), team('r2', 'CONFIRMED')]} myRegId="r2" />);
    expect(screen.getByText('Votre équipe')).toBeInTheDocument();
    const mine = screen.getByTestId('team-r2');
    const other = screen.getByTestId('team-r1');
    expect(mine.style.boxShadow).not.toBe(other.style.boxShadow);
  });
});
