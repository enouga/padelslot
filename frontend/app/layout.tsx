import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'PadelConnect',
  description: 'Réservez vos terrains de padel en ligne',
  manifest: '/manifest.json',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <body suppressHydrationWarning className="min-h-screen bg-gray-50 text-gray-900">{children}</body>
    </html>
  );
}
