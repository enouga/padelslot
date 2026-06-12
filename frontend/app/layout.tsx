import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { permanentRedirect } from 'next/navigation';
import { Geist, Geist_Mono, Righteous } from 'next/font/google';
import './globals.css';
import { ClubProvider } from '@/lib/ClubProvider';
import { api } from '@/lib/api';

// Geist sur tout le site : Geist Sans (titres + UI) et Geist Mono (données).
const geistSans = Geist({
  subsets: ['latin'],
  variable: '--font-ui',
  display: 'swap',
});

const geistMono = Geist_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
});

// Righteous (graisse unique 400) : police « brand » réservée au libellé Club-house.
const righteous = Righteous({
  subsets: ['latin'],
  weight: '400',
  variable: '--font-brand',
  display: 'swap',
});

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

// L'apple-touch-icon est par club sur un hôte club (iOS ne lit pas le manifest pour
// l'icône d'accueil et ne supporte pas le SVG) ; le backend gère le repli Palova.
// Le <link rel="manifest"> est injecté automatiquement par Next (app/manifest.ts).
export async function generateMetadata(): Promise<Metadata> {
  const slug = (await headers()).get('x-club-slug');
  return {
    title: 'Palova',
    description: 'Réservez votre terrain de padel en quelques secondes',
    icons: {
      icon: '/favicon.svg',
      apple: slug ? `${API_URL}/api/clubs/${slug}/icon/apple-180.png` : '/apple-touch-icon.png',
    },
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const h = await headers();
  const slug = h.get('x-club-slug');

  // Hôte club : si le slug est un ANCIEN alias, redirection permanente (308) vers le
  // sous-domaine actuel en conservant chemin + query. En cas d'échec de l'API (club
  // inconnu, backend indisponible), on laisse la page se rendre comme aujourd'hui.
  let movedTo: string | null = null;
  if (slug) {
    try {
      const r = await api.resolveClubSlug(slug);
      if (r.moved && r.slug !== slug) movedTo = r.slug;
    } catch { /* comportement actuel inchangé */ }
  }
  if (movedTo) {
    const host = h.get('host') || '';
    const proto = h.get('x-forwarded-proto') || 'http';
    const path = h.get('x-club-path') || '/';
    permanentRedirect(`${proto}://${host.replace(/^[^.]+/, movedTo)}${path}`);
  }

  return (
    <html lang="fr" className={`${geistSans.variable} ${geistMono.variable} ${righteous.variable}`} suppressHydrationWarning>
      <body suppressHydrationWarning>
        <ClubProvider slug={slug}>{children}</ClubProvider>
      </body>
    </html>
  );
}
