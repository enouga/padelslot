import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import MyProfilePage from '../app/me/profile/page';
import { ThemeProvider } from '../lib/ThemeProvider';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
}));

// Contexte club contrôlable : slug null = hôte plateforme, sinon hôte club.
let clubCtx: { slug: string | null; club: { id: string; slug: string; name: string } | null; loading: boolean } =
  { slug: null, club: null, loading: false };
jest.mock('../lib/ClubProvider', () => ({ useClub: () => clubCtx }));

jest.mock('../components/ClubNav', () => ({ ClubNav: () => <nav /> }));

jest.mock('../lib/api', () => ({
  api: {
    getMyProfile: jest.fn(),
    getMyClubs: jest.fn(),
    getMyClubMembership: jest.fn(),
    getMyClubPackages: jest.fn(),
    updateMyProfile: jest.fn(),
    updateMyClubMembership: jest.fn(),
    uploadMyAvatar: jest.fn(),
  },
  assetUrl: (p: string | null) => (p ? `http://localhost:3001${p}` : null),
}));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { api } = require('../lib/api') as { api: Record<string, jest.Mock> };

const profile = {
  id: 'u1', email: 'eric@palova.fr', firstName: 'Eric', lastName: 'Nougayrede', phone: '0609032635', sex: 'MALE',
  birthDate: '1973-07-08T00:00:00.000Z', avatarUrl: null, locale: 'fr', isSuperAdmin: false,
};

const wrap = () => render(<ThemeProvider><MyProfilePage /></ThemeProvider>);

describe('Page Mon profil', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    document.cookie = 'token=abc; path=/';
    clubCtx = { slug: null, club: null, loading: false };
    api.getMyProfile.mockResolvedValue(profile);
    api.getMyClubs.mockResolvedValue([]);
    api.getMyClubMembership.mockResolvedValue(null);
    api.getMyClubPackages.mockResolvedValue([]);
    api.updateMyProfile.mockResolvedValue(profile);
    api.uploadMyAvatar.mockResolvedValue({ ...profile, avatarUrl: '/uploads/avatars/u1-2.png' });
  });
  afterEach(() => { document.cookie = 'token=; max-age=0; path=/'; });

  it('affiche identité, email non modifiable et valeurs des champs', async () => {
    wrap();
    expect(await screen.findByText('Eric')).toBeInTheDocument();
    expect(screen.getByText('Nougayrede')).toBeInTheDocument();
    expect(screen.getByText('eric@palova.fr')).toBeInTheDocument();
    expect(screen.getByText('L’email ne peut pas être modifié.')).toBeInTheDocument();
    expect(screen.getByLabelText('Téléphone')).toHaveValue('0609032635');
    expect(screen.getByLabelText('Date de naissance')).toHaveValue('1973-07-08');
  });

  it('Enregistrer envoie téléphone, sexe et date de naissance', async () => {
    wrap();
    await screen.findByLabelText('Téléphone');
    fireEvent.change(screen.getByLabelText('Téléphone'), { target: { value: '0699999999' } });
    fireEvent.change(screen.getByLabelText('Date de naissance'), { target: { value: '1980-01-15' } });
    fireEvent.click(screen.getByText('Femme'));
    fireEvent.click(screen.getByText('Enregistrer'));
    await waitFor(() => expect(api.updateMyProfile).toHaveBeenCalledWith(
      { phone: '0699999999', sex: 'FEMALE', birthDate: '1980-01-15' }, 'abc',
    ));
    expect(await screen.findByText('Enregistré ✓')).toBeInTheDocument();
  });

  it("la sélection d'un fichier déclenche l'upload d'avatar", async () => {
    global.URL.createObjectURL = jest.fn(() => 'blob:preview');
    wrap();
    const input = await screen.findByLabelText('Choisir une photo de profil');
    const file = new File(['x'], 'photo.png', { type: 'image/png' });
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => expect(api.uploadMyAvatar).toHaveBeenCalledWith(file, 'abc'));
  });

  it('refuse un format de fichier non supporté sans appeler l\'API', async () => {
    wrap();
    const input = await screen.findByLabelText('Choisir une photo de profil');
    const file = new File(['x'], 'doc.pdf', { type: 'application/pdf' });
    fireEvent.change(input, { target: { files: [file] } });
    expect(await screen.findByText('Format d’image non supporté (JPEG, PNG ou WebP)')).toBeInTheDocument();
    expect(api.uploadMyAvatar).not.toHaveBeenCalled();
  });

  it('changer la langue appelle updateMyProfile({ locale })', async () => {
    wrap();
    const select = await screen.findByLabelText('Langue');
    fireEvent.change(select, { target: { value: 'en' } });
    await waitFor(() => expect(api.updateMyProfile).toHaveBeenCalledWith({ locale: 'en' }, 'abc'));
  });

  it('le sélecteur de thème bascule en sombre (localStorage)', async () => {
    wrap();
    await screen.findByText('Thème');
    fireEvent.click(screen.getByText('Sombre'));
    expect(localStorage.getItem('palova-theme')).toBe('floodlit');
  });

  it('hôte club + membre : la section licence enregistre via updateMyClubMembership', async () => {
    clubCtx = { slug: 'demo', club: { id: 'c1', slug: 'demo', name: 'Club Démo' }, loading: false };
    api.getMyClubMembership.mockResolvedValue({ membershipNo: 'LIC42', status: 'ACTIVE', isSubscriber: true });
    api.updateMyClubMembership.mockResolvedValue({ membershipNo: 'LIC99', status: 'ACTIVE', isSubscriber: true });
    wrap();
    const input = await screen.findByLabelText('N° de licence / adhérent');
    expect(input).toHaveValue('LIC42');
    fireEvent.change(input, { target: { value: 'LIC99' } });
    fireEvent.click(screen.getAllByText('Enregistrer')[1]);
    await waitFor(() => expect(api.updateMyClubMembership).toHaveBeenCalledWith('demo', 'LIC99', 'abc'));
  });

  it('hôte plateforme : pas de section licence', async () => {
    wrap();
    await screen.findByText('Eric');
    expect(screen.queryByLabelText('N° de licence / adhérent')).not.toBeInTheDocument();
  });
});
