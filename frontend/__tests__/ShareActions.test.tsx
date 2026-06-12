import { render, screen, fireEvent, act } from '@testing-library/react';
import { ShareActions } from '../components/tournament/ShareActions';
import { ThemeProvider } from '../lib/ThemeProvider';
import { TournamentDetail } from '../lib/api';

const t = {
  id: 't1', clubId: 'c1', clubSportId: 'cs1', name: 'Grand Prix Messieurs', category: 'P500', gender: 'MEN',
  description: 'Super tournoi', startTime: '2026-07-09T12:01:00Z', endTime: null,
  registrationDeadline: '2026-07-04T12:01:00Z', maxTeams: 12, entryFee: '40', status: 'PUBLISHED',
  confirmedCount: 7, waitlistCount: 0,
  club: { slug: 'demo', name: 'Toulouse Padel Indoor', timezone: 'Europe/Paris' },
  clubSport: { sport: { key: 'padel', name: 'Padel' } },
} as TournamentDetail;

const wrap = () => render(<ThemeProvider><ShareActions item={t} uidPrefix="tournament" /></ThemeProvider>);

describe('ShareActions', () => {
  afterEach(() => {
    // jsdom n'a ni share ni clipboard : on nettoie ce que les tests posent.
    delete (navigator as { share?: unknown }).share;
  });

  it('sans Web Share API → copie le lien et affiche « Lien copié ! »', async () => {
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    wrap();
    await act(async () => { fireEvent.click(screen.getByText('Partager')); });
    expect(writeText).toHaveBeenCalledWith(window.location.href);
    expect(screen.getByText('Lien copié !')).toBeInTheDocument();
  });

  it('avec Web Share API → navigator.share', async () => {
    const share = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'share', { value: share, configurable: true });
    wrap();
    await act(async () => { fireEvent.click(screen.getByText('Partager')); });
    expect(share).toHaveBeenCalledWith({ title: 'Grand Prix Messieurs', url: window.location.href });
    expect(screen.queryByText('Lien copié !')).not.toBeInTheDocument();
  });

  it('« Ajouter au calendrier » télécharge un .ics', () => {
    const createObjectURL = jest.fn().mockReturnValue('blob:x');
    const revokeObjectURL = jest.fn();
    Object.defineProperty(URL, 'createObjectURL', { value: createObjectURL, configurable: true });
    Object.defineProperty(URL, 'revokeObjectURL', { value: revokeObjectURL, configurable: true });
    const click = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    wrap();
    fireEvent.click(screen.getByText('Ajouter au calendrier'));
    expect(createObjectURL).toHaveBeenCalled();
    const blob = createObjectURL.mock.calls[0][0] as Blob;
    expect(blob.type).toBe('text/calendar;charset=utf-8');
    expect(click).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:x');
    click.mockRestore();
  });
});
