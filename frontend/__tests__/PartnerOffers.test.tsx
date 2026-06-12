import { render, screen, fireEvent, act } from '@testing-library/react';
import { PartnerOffers } from '../components/clubhouse/PartnerOffers';
import { ThemeProvider } from '../lib/ThemeProvider';
import { Sponsor } from '../lib/api';

const NOW = new Date('2026-06-10T12:00:00Z');

const sponsor = (over: Partial<Sponsor>): Sponsor => ({
  id: 's1', name: 'Babolat', logoUrl: 'https://x/logo.png', linkUrl: null,
  sortOrder: 0, isActive: true, createdAt: '', offerText: null, offerCode: null,
  offerUntil: null, pinned: false, ...over,
});
const wrap = (sponsors: Sponsor[], now: Date | null = NOW) =>
  render(<ThemeProvider><PartnerOffers sponsors={sponsors} now={now} /></ThemeProvider>);

describe('PartnerOffers', () => {
  it('ne rend rien sans sponsors', () => {
    wrap([]);
    expect(screen.queryByText('Offres partenaires')).not.toBeInTheDocument();
  });

  it('affiche le texte d offre et copie le code dans le presse-papier', async () => {
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    wrap([sponsor({ offerText: '−10 % raquettes', offerCode: 'TPC10' })]);
    expect(screen.getByText('−10 % raquettes')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /TPC10/ }));
    expect(writeText).toHaveBeenCalledWith('TPC10');
    expect(await screen.findByText('Copié !')).toBeInTheDocument();
  });

  it('partenaire épinglé → carte à la une avec chip d expiration, carte cliquable', () => {
    wrap([sponsor({ pinned: true, linkUrl: 'https://babolat.fr', offerText: '−10 % raquettes', offerUntil: '2026-06-30T23:59:59.999Z' })]);
    expect(screen.getByText('Partenaire à la une')).toBeInTheDocument();
    expect(screen.getByText('Expire J-20')).toBeInTheDocument();
    expect(screen.getByLabelText('Voir le site de Babolat')).toHaveAttribute('href', 'https://babolat.fr');
  });

  it('le bouton code n est pas dans l ancre (copie sans navigation)', () => {
    wrap([sponsor({ linkUrl: 'https://babolat.fr', offerText: 'Offre', offerCode: 'TPC10' })]);
    expect(screen.getByText('TPC10').closest('a')).toBeNull();
  });

  it('offre expirée → le partenaire redescend en logo seul', () => {
    wrap([
      sponsor({ offerText: 'Offre active' }),
      sponsor({ id: 's2', name: 'Brasserie', offerText: 'Happy hour', offerUntil: '2026-06-01T23:59:59.999Z' }),
    ]);
    expect(screen.getByText('Ils soutiennent le club')).toBeInTheDocument();
    expect(screen.queryByText('Happy hour')).not.toBeInTheDocument();
    expect(screen.getByAltText('Brasserie')).toBeInTheDocument();
  });

  it('now=null → pas de chip d expiration et expiration ignorée', () => {
    wrap([sponsor({ offerText: 'Offre', offerUntil: '2026-06-01T23:59:59.999Z' })], null);
    expect(screen.getByText('Offre')).toBeInTheDocument();
    expect(screen.queryByText(/Expire/)).not.toBeInTheDocument();
  });

  it('sponsor sans offre → logo seul (pas de code)', () => {
    wrap([sponsor({})]);
    const img = screen.getByAltText('Babolat');
    expect(img).toBeInTheDocument();
    expect(screen.queryByText('Copié !')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('clics rapides sur deux codes : le second feedback ne se fait pas couper par le timer du premier', async () => {
    jest.useFakeTimers();
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    wrap([
      sponsor({ id: 'sA', name: 'A', offerText: 'Offre A', offerCode: 'CODEA' }),
      sponsor({ id: 'sB', name: 'B', offerText: 'Offre B', offerCode: 'CODEB' }),
    ]);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /CODEA/ }));
    });
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /CODEB/ }));
    });
    await act(async () => {
      jest.advanceTimersByTime(1500);
    });
    // 2,5 s après le clic A mais 1,5 s après le clic B : B doit encore afficher « Copié ! »
    expect(screen.getByText('Copié !')).toBeInTheDocument();
    await act(async () => {
      jest.advanceTimersByTime(501);
    });
    expect(screen.queryByText('Copié !')).not.toBeInTheDocument();
    jest.useRealTimers();
  });
});
