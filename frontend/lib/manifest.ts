// Construction pure du manifest PWA (consommée par app/manifest.ts, testable sans Next).
// Hôte plateforme (club null) → identité Palova ; hôte club → nom/couleur/icônes du club.
const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export interface ManifestClub {
  slug: string;
  name: string;
  accentColor: string;
  logoUrl: string | null;
}

export interface ManifestIcon { src: string; sizes: string; type: string; purpose?: 'maskable' }
export interface WebManifest {
  name: string; short_name: string; description: string; start_url: string;
  display: 'standalone'; background_color: string; theme_color: string; icons: ManifestIcon[];
}

const PALOVA_ICONS: ManifestIcon[] = [
  { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
  { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
  { src: '/icon-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
  { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
];

// Icônes générées par le backend depuis le logo du club (repli Palova géré côté backend).
function clubIcons(slug: string): ManifestIcon[] {
  const base = `${API}/api/clubs/${slug}/icon`;
  return [
    { src: `${base}/192.png`, sizes: '192x192', type: 'image/png' },
    { src: `${base}/512.png`, sizes: '512x512', type: 'image/png' },
    { src: `${base}/maskable-192.png`, sizes: '192x192', type: 'image/png', purpose: 'maskable' },
    { src: `${base}/maskable-512.png`, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ];
}

// short_name : affiché sous l'icône installée — 12 caractères max.
export function shortName(name: string): string {
  const n = name.trim();
  return n.length <= 12 ? n : `${n.slice(0, 11).trimEnd()}…`;
}

export function buildManifest(club: ManifestClub | null): WebManifest {
  if (!club) {
    return {
      name: 'Palova', short_name: 'Palova',
      description: 'Réservez vos terrains de padel',
      start_url: '/', display: 'standalone',
      background_color: '#ffffff', theme_color: '#5e93da',
      icons: PALOVA_ICONS,
    };
  }
  return {
    name: club.name, short_name: shortName(club.name),
    description: `Réservations et vie du club ${club.name}`,
    start_url: '/', display: 'standalone',
    background_color: '#ffffff', theme_color: club.accentColor,
    icons: club.logoUrl ? clubIcons(club.slug) : PALOVA_ICONS,
  };
}
