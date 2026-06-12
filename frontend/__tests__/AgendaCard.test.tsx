import { render, screen, fireEvent } from '@testing-library/react';
import { AgendaCard } from '../components/agenda/AgendaCard';
import { ThemeProvider } from '../lib/ThemeProvider';
import { ACCENTS } from '../lib/theme';

const NOW = new Date('2026-06-10T12:00:00Z');

const base = {
  icon: 'trophy' as const,
  accent: ACCENTS.apricot,
  tag: 'P500 · Messieurs',
  title: 'Grand Prix Messieurs',
  dateLabel: 'jeudi 9 juillet · 14h01',
  deadline: '2026-07-04T12:01:00Z',
  ratio: 7 / 12,
  places: { text: 'Plus que 5 places', urgent: true },
  extra: '40 €',
  onClick: jest.fn(),
};

const wrap = (over: Partial<typeof base> & { now: Date | null }) =>
  render(<ThemeProvider><AgendaCard {...base} {...over} /></ThemeProvider>);

describe('AgendaCard', () => {
  it('affiche tag, titre, date, extra, countdown et places', () => {
    wrap({ now: NOW });
    expect(screen.getByText('P500 · Messieurs')).toBeInTheDocument();
    expect(screen.getByText('Grand Prix Messieurs')).toBeInTheDocument();
    expect(screen.getByText('jeudi 9 juillet · 14h01 · 40 €')).toBeInTheDocument();
    expect(screen.getByText('J-24')).toBeInTheDocument();
    expect(screen.getByText('Plus que 5 places')).toBeInTheDocument();
    expect(screen.getByTestId('card-fill').style.width).toBe('58%');
  });

  it('now=null → pas de countdown, jauge à 0', () => {
    wrap({ now: null });
    expect(screen.queryByText('J-24')).not.toBeInTheDocument();
    expect(screen.getByTestId('card-fill').style.width).toBe('0px');
  });

  it('sans capacité → pas de jauge ; clic → onClick', () => {
    const onClick = jest.fn();
    wrap({ now: NOW, ratio: null, onClick });
    expect(screen.queryByTestId('card-fill')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Grand Prix Messieurs'));
    expect(onClick).toHaveBeenCalled();
  });
});
