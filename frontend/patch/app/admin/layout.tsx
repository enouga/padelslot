'use client';
import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import Logo from '@/components/Logo';
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

  if (!ready || !token || role !== 'CLUB_ADMIN') {
    return <div className="p-8 text-faint">Chargement…</div>;
  }

  const links = [
    { href: '/admin',              label: 'Tableau de bord' },
    { href: '/admin/courts',       label: 'Terrains' },
    { href: '/admin/reservations', label: 'Réservations' },
  ];

  return (
    <div className="min-h-screen bg-paper">
      <header className="border-b border-ink/10 bg-card">
        <div className="mx-auto flex max-w-5xl items-center gap-7 px-6 py-4">
          <div className="flex items-center gap-2.5">
            <Logo size={26} />
            <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-mute">Admin</span>
          </div>
          <nav className="flex gap-5 text-sm">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={pathname === l.href ? 'font-semibold text-brand-600' : 'text-mute hover:text-ink'}
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
