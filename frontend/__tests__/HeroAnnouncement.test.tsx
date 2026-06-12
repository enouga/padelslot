import { render, screen, fireEvent } from '@testing-library/react';
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
  it('affiche le kicker « À la une », le titre et le corps (clampé à 3 lignes)', () => {
    wrap(ann({}));
    expect(screen.getByText('À la une')).toBeInTheDocument();
    expect(screen.getByText('Tournoi interne samedi')).toBeInTheDocument();
    const body = screen.getByText('Lots à gagner !');
    expect(body).toBeInTheDocument();
    expect(body.style.overflow).toBe('hidden'); // line-clamp 3 dans le bandeau
  });

  it('avec linkUrl → CTA externe « En savoir plus »', () => {
    wrap(ann({ linkUrl: 'https://club.fr/tournoi' }));
    expect(screen.getByRole('link', { name: /En savoir plus/ })).toHaveAttribute('href', 'https://club.fr/tournoi');
    expect(screen.queryByText('Réserver un terrain →')).not.toBeInTheDocument();
  });

  it('sans linkUrl → CTA par défaut « Réserver un terrain » vers /reserver', () => {
    wrap(ann({}));
    expect(screen.getByText('Réserver un terrain →')).toHaveAttribute('href', '/reserver');
    expect(screen.queryByText('En savoir plus →')).not.toBeInTheDocument();
  });

  it('clic sur le bandeau → feuille avec l annonce complète ; « Fermer » la referme', () => {
    wrap(ann({ body: 'Ligne 1\nLigne 2\nLigne 3\nLigne 4 bien cachée' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('hero-announcement'));
    expect(screen.getByRole('dialog')).toHaveTextContent('Ligne 4 bien cachée');
    fireEvent.click(screen.getByText('Fermer'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('la feuille propose aussi le lien externe quand il existe', () => {
    wrap(ann({ linkUrl: 'https://club.fr/tournoi' }));
    fireEvent.click(screen.getByTestId('hero-announcement'));
    expect(screen.getAllByRole('link', { name: /En savoir plus/ })).toHaveLength(2);
  });

  it('clic sur le CTA → la feuille ne s ouvre pas (stopPropagation)', () => {
    wrap(ann({}));
    fireEvent.click(screen.getByText('Réserver un terrain →'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('clavier : Entrée sur le bandeau ouvre la feuille', () => {
    wrap(ann({}));
    fireEvent.keyDown(screen.getByTestId('hero-announcement'), { key: 'Enter' });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
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
