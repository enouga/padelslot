import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import SuperAdminClubs from '../app/superadmin/clubs/page';
import { ThemeProvider } from '../lib/ThemeProvider';

const platformClubs = jest.fn();
const platformChangeClubSlug = jest.fn();
jest.mock('../lib/api', () => ({
  api: {
    platformClubs: (...a: unknown[]) => platformClubs(...a),
    platformSetClubStatus: jest.fn(),
    platformChangeClubSlug: (...a: unknown[]) => platformChangeClubSlug(...a),
  },
}));
jest.mock('../lib/useAuth', () => ({ useAuth: () => ({ token: 'tok' }) }));

const club = {
  id: 'club-1', slug: 'old-arena', name: 'Padel Arena Paris', city: 'Paris',
  status: 'ACTIVE', createdAt: '2026-01-01', aliases: ['tout-premier'],
  owners: [{ id: 'u1', email: 'owner@x.fr', firstName: 'O', lastName: 'M' }],
  counts: { adherents: 10, resources: 4 },
};

function renderPage() {
  return render(<ThemeProvider><SuperAdminClubs /></ThemeProvider>);
}

beforeEach(() => {
  jest.clearAllMocks();
  platformClubs.mockResolvedValue([club]);
});

it('affiche les alias existants du club', async () => {
  renderPage();
  expect(await screen.findByText(/Alias : tout-premier/)).toBeInTheDocument();
});

it('ouvre le dialog avec la suggestion slugify(nom) et envoie le nouveau slug', async () => {
  platformChangeClubSlug.mockResolvedValue({ id: 'club-1', slug: 'padel-arena-paris', name: club.name });
  renderPage();
  fireEvent.click(await screen.findByRole('button', { name: "Changer l'alias" }));
  expect(screen.getByDisplayValue('padel-arena-paris')).toBeInTheDocument();
  // Deux boutons portent ce nom (ligne + dialog) : celui du dialog est rendu en dernier.
  const dialogConfirm = screen.getAllByRole('button', { name: "Changer l'alias" }).pop()!;
  fireEvent.click(dialogConfirm);
  await waitFor(() =>
    expect(platformChangeClubSlug).toHaveBeenCalledWith('club-1', 'padel-arena-paris', 'tok'));
});

it("affiche l'erreur française quand l'alias est pris", async () => {
  platformChangeClubSlug.mockRejectedValue(new Error('SLUG_TAKEN'));
  renderPage();
  fireEvent.click(await screen.findByRole('button', { name: "Changer l'alias" }));
  const dialogConfirm = screen.getAllByRole('button', { name: "Changer l'alias" }).pop()!;
  fireEvent.click(dialogConfirm);
  expect(await screen.findByText(/déjà utilisé ou réservé/)).toBeInTheDocument();
});
