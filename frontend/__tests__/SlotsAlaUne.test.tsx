import { render, screen } from '@testing-library/react';
import { SlotsAlaUne } from '../components/clubhouse/SlotsAlaUne';
import { ThemeProvider } from '../lib/ThemeProvider';
import { UpcomingSlot } from '../lib/clubhouse';

const s: UpcomingSlot = {
  resourceId: 'court-1', resourceName: 'Terrain 1',
  slot: { startTime: '2026-06-10T17:00:00.000Z', endTime: '2026-06-10T18:00:00.000Z', available: true, pricePerHour: '25', totalPrice: '25.00', offPeak: false },
};
const wrap = (slots: UpcomingSlot[]) =>
  render(<ThemeProvider><SlotsAlaUne slots={slots} timezone="Europe/Paris" /></ThemeProvider>);

describe('SlotsAlaUne', () => {
  it('ne rend rien sans créneaux', () => {
    wrap([]);
    expect(screen.queryByText(/À saisir/)).not.toBeInTheDocument();
  });

  it('affiche terrain, heure (fuseau club), prix et lien profond de réservation', () => {
    wrap([s]);
    expect(screen.getByText(/À saisir aujourd/)).toBeInTheDocument();
    expect(screen.getByText('Terrain 1')).toBeInTheDocument();
    expect(screen.getByText(/19h00/)).toBeInTheDocument(); // 17h UTC = 19h Paris
    expect(screen.getByText(/25 €\/h/)).toBeInTheDocument(); // prix affiché
    const link = screen.getByRole('link', { name: 'Réserver' });
    expect(link.getAttribute('href')).toBe('/reserver?resource=court-1&start=2026-06-10T17%3A00%3A00.000Z');
  });
});
