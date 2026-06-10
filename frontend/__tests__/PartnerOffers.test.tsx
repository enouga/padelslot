import { render, screen, fireEvent } from '@testing-library/react';
import { PartnerOffers } from '../components/clubhouse/PartnerOffers';
import { ThemeProvider } from '../lib/ThemeProvider';
import { Sponsor } from '../lib/api';

const sponsor = (over: Partial<Sponsor>): Sponsor => ({
  id: 's1', name: 'Babolat', logoUrl: 'https://x/logo.png', linkUrl: null,
  sortOrder: 0, isActive: true, createdAt: '', offerText: null, offerCode: null, ...over,
});
const wrap = (sponsors: Sponsor[]) =>
  render(<ThemeProvider><PartnerOffers sponsors={sponsors} /></ThemeProvider>);

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

  it('sponsor sans offre → logo seul (pas de code)', () => {
    wrap([sponsor({})]);
    const img = screen.getByAltText('Babolat');
    expect(img).toBeInTheDocument();
    expect(screen.queryByText('Copié !')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
