'use client';
import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/useAuth';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { token, role, ready } = useAuth();

  useEffect(() => {
    if (!ready) return;
    if (!token) { router.replace('/login'); return; }
    if (role !== 'CLUB_ADMIN') { router.replace('/courts'); return; }
  }, [ready, token, role, router]);

  // Tant qu'on n'a pas validé le rôle, on n'affiche rien (évite le flash de contenu admin).
  if (!ready || !token || role !== 'CLUB_ADMIN') {
    return <div className="p-8 text-gray-400">Chargement…</div>;
  }

  const links = [
    { href: '/admin',              label: 'Tableau de bord' },
    { href: '/admin/courts',       label: 'Terrains' },
    { href: '/admin/reservations', label: 'Réservations' },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-5xl items-center gap-6 px-6 py-4">
          <span className="font-bold text-gray-800">PadelConnect · Admin</span>
          <nav className="flex gap-4 text-sm">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={pathname === l.href ? 'font-semibold text-blue-600' : 'text-gray-600 hover:text-gray-900'}
              >
                {l.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
    </div>
  );
}
