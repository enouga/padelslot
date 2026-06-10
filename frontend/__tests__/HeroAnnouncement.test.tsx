import { render, screen } from '@testing-library/react';
import { HeroAnnouncement } from '../components/clubhouse/HeroAnnouncement';
import { ThemeProvider } from '../lib/ThemeProvider';
import { Announcement } from '../lib/api';

const ann = (over: Partial<Announcement>): Announcement => ({
  id: 'a1', title: 'Tournoi interne samedi', body: 'Lots à gagner !', linkUrl: null,
  imageUrl: null, isPublished: true, pinned: true, createdAt: '', updatedAt: '', ...over,
});
const wrap = (a: Announcement) =>
  render(<ThemeProvider><HeroAnnouncement announcement={a} /></ThemeProvider>);

describe('HeroAnnouncement', () => {
  it('affiche le kicker « À la une », le titre et le corps', () => {
    wrap(ann({}));
    expect(screen.getByText('À la une')).toBeInTheDocument();
    expect(screen.getByText('Tournoi interne samedi')).toBeInTheDocument();
    expect(screen.getByText('Lots à gagner !')).toBeInTheDocument();
  });

  it('affiche le CTA seulement si linkUrl est présent', () => {
    const { unmount } = wrap(ann({ linkUrl: 'https://club.fr/tournoi' }));
    expect(screen.getByRole('link', { name: /En savoir plus/ })).toHaveAttribute('href', 'https://club.fr/tournoi');
    unmount();
    wrap(ann({}));
    expect(screen.queryByRole('link', { name: /En savoir plus/ })).not.toBeInTheDocument();
  });

  it('utilise imageUrl en fond quand présent', () => {
    wrap(ann({ imageUrl: 'https://x/photo.jpg' }));
    const hero = screen.getByTestId('hero-announcement');
    expect(hero.outerHTML).toContain('photo.jpg');
    expect(hero.outerHTML).toContain('rgba(18, 22, 30');
  });

  it("neutralise une imageUrl hostile (quotes/parenthèses retirées du CSS)", () => {
    wrap(ann({ imageUrl: "https://x/a.jpg'),url('javascript:alert(1)" }));
    const hero = screen.getByTestId('hero-announcement');
    expect(hero.outerHTML).not.toContain("alert(1)");
    expect(hero.outerHTML).not.toContain("')");
  });
});
