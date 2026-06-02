import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import { ClubProvider } from '@/lib/ClubProvider';

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

export const metadata: Metadata = {
  title: 'SlotPadel',
  description: 'Réservez votre terrain de padel en quelques secondes',
  manifest: '/manifest.json',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const slug = (await headers()).get('x-club-slug');
  return (
    <html lang="fr" className={`${geistSans.variable} ${geistMono.variable}`} suppressHydrationWarning>
      <body suppressHydrationWarning>
        <ClubProvider slug={slug}>{children}</ClubProvider>
      </body>
    </html>
  );
}
