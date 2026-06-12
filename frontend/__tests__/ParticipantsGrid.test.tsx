import { render, screen } from '@testing-library/react';
import { ParticipantsGrid } from '../components/event/ParticipantsGrid';
import { ThemeProvider } from '../lib/ThemeProvider';
import { EventParticipant } from '../lib/api';

jest.mock('../lib/api', () => ({
  assetUrl: (p: string | null) => p,
  api: {},
}));

const reg = (id: string, status: 'CONFIRMED' | 'WAITLISTED', avatarUrl: string | null = null): EventParticipant =>
  ({ id, status, user: { firstName: 'Léa', lastName: 'Martin', avatarUrl } });

const wrap = (ui: React.ReactElement) => render(<ThemeProvider>{ui}</ThemeProvider>);

describe('ParticipantsGrid', () => {
  it('chargement puis liste vide', () => {
    wrap(<ParticipantsGrid participants={null} />);
    expect(screen.getByText('Chargement…')).toBeInTheDocument();
    wrap(<ParticipantsGrid participants={[]} />);
    expect(screen.getByText(/Aucun inscrit/)).toBeInTheDocument();
  });

  it('sections avec compteurs et positions d attente', () => {
    wrap(<ParticipantsGrid participants={[reg('r1', 'CONFIRMED'), reg('r2', 'WAITLISTED'), reg('r3', 'WAITLISTED')]} />);
    expect(screen.getByText('Confirmés (1)')).toBeInTheDocument();
    expect(screen.getByText("Liste d'attente (2)")).toBeInTheDocument();
    expect(screen.getByText('Attente · n°1')).toBeInTheDocument();
    expect(screen.getByText('Attente · n°2')).toBeInTheDocument();
  });

  it('photo si avatarUrl, initiales sinon, et badge « Vous »', () => {
    wrap(<ParticipantsGrid participants={[reg('r1', 'CONFIRMED', '/uploads/avatars/l.jpg'), reg('r2', 'CONFIRMED')]} myRegId="r2" />);
    expect(screen.getByAltText('Léa Martin')).toHaveAttribute('src', '/uploads/avatars/l.jpg');
    expect(screen.getByText('LM')).toBeInTheDocument();
    expect(screen.getByText('Vous')).toBeInTheDocument();
    expect(screen.getByTestId('participant-r2').style.boxShadow).not.toBe(screen.getByTestId('participant-r1').style.boxShadow);
  });
});
