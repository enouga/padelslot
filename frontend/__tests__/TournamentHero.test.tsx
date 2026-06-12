import { render, screen } from '@testing-library/react';
import { TournamentHero, MetaCards } from '../components/tournament/TournamentHero';
import { ThemeProvider } from '../lib/ThemeProvider';
import { TournamentDetail } from '../lib/api';

const NOW = new Date('2026-06-10T12:00:00Z');

const tournament = (over: Partial<TournamentDetail> = {}): TournamentDetail => ({
  id: 't1', clubId: 'c1', clubSportId: 'cs1', name: 'Grand Prix Messieurs', category: 'P500', gender: 'MEN',
  description: null, startTime: '2026-07-09T12:01:00Z', endTime: null,
  registrationDeadline: '2026-07-04T12:01:00Z', maxTeams: 12, entryFee: '40', status: 'PUBLISHED',
  confirmedCount: 7, waitlistCount: 0,
  club: { slug: 'demo', name: 'Toulouse Padel Indoor', timezone: 'Europe/Paris' },
  clubSport: { sport: { key: 'padel', name: 'Padel' } },
  ...over,
});

const wrap = (ui: React.ReactElement) => render(<ThemeProvider>{ui}</ThemeProvider>);

describe('TournamentHero', () => {
  it('affiche titre, club, compteur et countdown J-x', () => {
    wrap(<TournamentHero t={tournament()} now={NOW} />);
    expect(screen.getByText('Grand Prix Messieurs')).toBeInTheDocument();
    expect(screen.getByText('Toulouse Padel Indoor')).toBeInTheDocument();
    expect(screen.getByText('7/12 binômes')).toBeInTheDocument();
    expect(screen.getByText('J-24')).toBeInTheDocument();
    expect(screen.getByText('Plus que 5 places')).toBeInTheDocument();
  });

  it('now=null (avant mount) → pas de countdown, jauge à 0', () => {
    wrap(<TournamentHero t={tournament()} now={null} />);
    expect(screen.queryByText('J-24')).not.toBeInTheDocument();
    expect(screen.getByTestId('hero-fill').style.width).toBe('0px');
  });

  it('jauge remplie au prorata une fois monté', () => {
    wrap(<TournamentHero t={tournament()} now={NOW} />);
    expect(screen.getByTestId('hero-fill').style.width).toBe('58%');
  });

  it('urgence places restantes → badge « Plus que X places »', () => {
    wrap(<TournamentHero t={tournament({ confirmedCount: 10 })} now={NOW} />);
    expect(screen.getByText('Plus que 2 places')).toBeInTheDocument();
  });

  it('deadline < 48 h → countdown en heures', () => {
    wrap(<TournamentHero t={tournament({ registrationDeadline: '2026-06-10T18:00:00Z' })} now={NOW} />);
    expect(screen.getByText('Plus que 6 h')).toBeInTheDocument();
  });

  it('sans capacité → pas de jauge, compteur simple', () => {
    wrap(<TournamentHero t={tournament({ maxTeams: null })} now={NOW} />);
    expect(screen.queryByTestId('hero-fill')).not.toBeInTheDocument();
    expect(screen.getByText('7 binômes')).toBeInTheDocument();
  });
});

describe('MetaCards', () => {
  it('début, clôture et prix dans le fuseau du club', () => {
    wrap(<MetaCards t={tournament()} />);
    expect(screen.getByText('jeudi 9 juillet à 14h01')).toBeInTheDocument();
    expect(screen.getByText('samedi 4 juillet à 14h01')).toBeInTheDocument();
    expect(screen.getByText('40 € par binôme')).toBeInTheDocument();
  });

  it('pas de carte prix sans entryFee', () => {
    wrap(<MetaCards t={tournament({ entryFee: null })} />);
    expect(screen.queryByText(/par binôme/)).not.toBeInTheDocument();
  });
});
