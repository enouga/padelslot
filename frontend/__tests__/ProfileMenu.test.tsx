import { render, screen, fireEvent } from '@testing-library/react';
import { ProfileMenu } from '../components/ProfileMenu';
import { ThemeProvider } from '../lib/ThemeProvider';

const push = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: jest.fn(), back: jest.fn() }),
}));

// Contexte club contrôlable : slug null = hôte plateforme, sinon hôte club.
let clubCtx: { slug: string | null; club: { id: string; slug: string; name: string } | null; loading: boolean } =
  { slug: null, club: null, loading: false };
jest.mock('../lib/ClubProvider', () => ({ useClub: () => clubCtx }));

jest.mock('../lib/api', () => ({
  api: {
    getMyProfile: jest.fn(),
    getMyClubs: jest.fn(),
    getMyClubMembership: jest.fn(),
    getMyClubPackages: jest.fn(),
  },
  assetUrl: (p: string | null) => (p ? `http://localhost:3001${p}` : null),
}));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { api } = require('../lib/api') as { api: Record<string, jest.Mock> };

// État d'installation PWA contrôlable par test (objet stable — cf. note mocks CLAUDE.md).
const installCtx: { state: 'hidden' | 'native' | 'ios-manual'; promptInstall: jest.Mock } =
  { state: 'hidden', promptInstall: jest.fn() };
jest.mock('../lib/useInstallPrompt', () => ({ useInstallPrompt: () => installCtx }));

const profile = {
  id: 'u1', email: 'marc@palova.fr', firstName: 'Marc', lastName: 'Bidaut', phone: '0601020304', sex: 'MALE',
  birthDate: null, avatarUrl: null, locale: 'fr', isSuperAdmin: false,
};

const wrap = (direction?: 'down' | 'up') =>
  render(<ThemeProvider><ProfileMenu direction={direction} /></ThemeProvider>);

function clearCookies() {
  document.cookie = 'token=; max-age=0; path=/';
  document.cookie = 'clubId=; max-age=0; path=/';
}

const openMenu = () => fireEvent.click(screen.getByLabelText('Mon profil'));

describe('ProfileMenu', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearCookies();
    clubCtx = { slug: null, club: null, loading: false };
    api.getMyProfile.mockResolvedValue(profile);
    api.getMyClubs.mockResolvedValue([]);
    api.getMyClubMembership.mockResolvedValue(null);
    api.getMyClubPackages.mockResolvedValue([]);
    installCtx.state = 'hidden';
    installCtx.promptInstall = jest.fn();
  });
  afterEach(clearCookies);

  it('ne rend rien sans session', () => {
    const { container } = wrap();
    expect(container.querySelector('button')).toBeNull();
  });

  it('affiche le bouton avec une session, le menu reste fermé', async () => {
    document.cookie = 'token=abc; path=/';
    wrap();
    const btn = await screen.findByLabelText('Mon profil');
    expect(btn).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Se déconnecter')).not.toBeInTheDocument();
    expect(api.getMyProfile).not.toHaveBeenCalled(); // chargement paresseux
  });

  it("au clic : identité (nom, e-mail, initiales) + déconnexion + liens", async () => {
    document.cookie = 'token=abc; path=/';
    wrap();
    openMenu();
    expect(await screen.findByText('Marc Bidaut')).toBeInTheDocument();
    expect(screen.getByText('marc@palova.fr')).toBeInTheDocument();
    expect(screen.getByText('MB')).toBeInTheDocument();
    expect(screen.getByText('Se déconnecter')).toBeInTheDocument();
    expect(screen.getByText('Mes réservations')).toBeInTheDocument();
    expect(screen.getByText('Mes clubs')).toBeInTheDocument();
  });

  it('hôte club : chip Abonné et soldes utilisables', async () => {
    document.cookie = 'token=abc; path=/';
    clubCtx = { slug: 'demo', club: { id: 'c1', slug: 'demo', name: 'Club Démo' }, loading: false };
    api.getMyClubMembership.mockResolvedValue({ membershipNo: 'LIC42', status: 'ACTIVE', isSubscriber: true });
    api.getMyClubPackages.mockResolvedValue([
      { id: 'p1', kind: 'ENTRIES', creditsTotal: 10, creditsRemaining: 7, amountTotal: null, amountRemaining: null, purchasedAt: '2026-01-01', expiresAt: null, template: { name: 'Carnet 10' } },
      { id: 'p2', kind: 'ENTRIES', creditsTotal: 10, creditsRemaining: 0, amountTotal: null, amountRemaining: null, purchasedAt: '2026-01-01', expiresAt: null, template: { name: 'Carnet épuisé' } },
    ]);
    wrap();
    openMenu();
    expect(await screen.findByText('Abonné')).toBeInTheDocument();
    expect(screen.getByText('Carnet — 7 entrées')).toBeInTheDocument();
    expect(screen.queryByText(/Carnet — 0 entrée/)).not.toBeInTheDocument(); // solde épuisé masqué
  });

  it("hôte plateforme : pas de section soldes ni d'appel membership", async () => {
    document.cookie = 'token=abc; path=/';
    wrap();
    openMenu();
    await screen.findByText('Marc Bidaut');
    expect(screen.queryByText('Mes soldes')).not.toBeInTheDocument();
    expect(api.getMyClubMembership).not.toHaveBeenCalled();
  });

  it('lien Superadmin : seulement si super-admin ET hors hôte club', async () => {
    document.cookie = 'token=abc; path=/';
    api.getMyProfile.mockResolvedValue({ ...profile, isSuperAdmin: true });
    wrap();
    openMenu();
    expect(await screen.findByText('Superadmin')).toBeInTheDocument();
  });

  it('pas de lien Superadmin sur un hôte club, même super-admin', async () => {
    document.cookie = 'token=abc; path=/';
    clubCtx = { slug: 'demo', club: { id: 'c1', slug: 'demo', name: 'Club Démo' }, loading: false };
    api.getMyProfile.mockResolvedValue({ ...profile, isSuperAdmin: true });
    wrap();
    openMenu();
    await screen.findByText('Marc Bidaut');
    expect(screen.queryByText('Superadmin')).not.toBeInTheDocument();
  });

  it("lien « Espace club » seulement si gérant du club courant", async () => {
    document.cookie = 'token=abc; path=/';
    clubCtx = { slug: 'demo', club: { id: 'c1', slug: 'demo', name: 'Club Démo' }, loading: false };
    api.getMyClubs.mockResolvedValue([{ clubId: 'c1', slug: 'demo', name: 'Club Démo', role: 'OWNER' }]);
    wrap();
    openMenu();
    expect(await screen.findByText('Espace club')).toBeInTheDocument();
  });

  it('Échap et clic extérieur ferment le menu', async () => {
    document.cookie = 'token=abc; path=/';
    wrap();
    openMenu();
    await screen.findByText('Se déconnecter');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByText('Se déconnecter')).not.toBeInTheDocument();
    openMenu();
    await screen.findByText('Se déconnecter');
    fireEvent.mouseDown(document.body);
    expect(screen.queryByText('Se déconnecter')).not.toBeInTheDocument();
  });

  it('le lien « Mon profil » navigue vers /me/profile', async () => {
    document.cookie = 'token=abc; path=/';
    wrap();
    openMenu();
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Mon profil' }));
    expect(push).toHaveBeenCalledWith('/me/profile');
  });

  it('signale un profil incomplet sur le lien « Mon profil »', async () => {
    document.cookie = 'token=abc; path=/';
    api.getMyProfile.mockResolvedValue({ ...profile, phone: null });
    wrap();
    openMenu();
    expect(await screen.findByRole('menuitem', { name: 'Mon profil · incomplet' })).toBeInTheDocument();
  });

  it("affiche la photo d'avatar quand avatarUrl est défini, les initiales sinon", async () => {
    document.cookie = 'token=abc; path=/';
    api.getMyProfile.mockResolvedValue({ ...profile, avatarUrl: '/uploads/avatars/u1-1.png' });
    const { container } = wrap();
    openMenu();
    await screen.findByText('Marc Bidaut');
    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    expect(img!.getAttribute('src')).toContain('/uploads/avatars/u1-1.png');
    expect(screen.queryByText('MB')).not.toBeInTheDocument();
  });

  it("pas d'entrée Installer quand l'installation est impossible", async () => {
    document.cookie = 'token=abc; path=/';
    wrap();
    openMenu();
    await screen.findByText('Marc Bidaut');
    expect(screen.queryByText("Installer l'application")).not.toBeInTheDocument();
  });

  it('état native : le clic déclenche le prompt du navigateur', async () => {
    document.cookie = 'token=abc; path=/';
    installCtx.state = 'native';
    wrap();
    openMenu();
    fireEvent.click(await screen.findByText("Installer l'application"));
    expect(installCtx.promptInstall).toHaveBeenCalledTimes(1);
  });

  it("état ios-manual : le clic ouvre le tutoriel « Sur l'écran d'accueil »", async () => {
    document.cookie = 'token=abc; path=/';
    installCtx.state = 'ios-manual';
    wrap();
    openMenu();
    fireEvent.click(await screen.findByText("Installer l'application"));
    expect(installCtx.promptInstall).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: "Installer l'application" })).toBeInTheDocument();
    expect(screen.getByText(/Sur l'écran d'accueil/)).toBeInTheDocument();
    fireEvent.click(screen.getByText('Compris'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
