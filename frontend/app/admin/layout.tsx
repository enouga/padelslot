'use client';
import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { useAuth, logout } from '@/lib/useAuth';
import { useClub } from '@/lib/ClubProvider';
import { api } from '@/lib/api';
import { useTheme } from '@/lib/ThemeProvider';
import { Logotype, ThemeToggle } from '@/components/ui/atoms';
import { Icon } from '@/components/ui/Icon';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { th } = useTheme();
  const { token, ready } = useAuth();
  const { club } = useClub();
  const [allowed, setAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    if (!ready) return;
    if (!token) { router.replace('/login'); return; }
    if (!club) return; // attend le fetch du club (host)
    api.getMyClubs(token)
      .then((cs) => setAllowed(cs.some((c) => c.clubId === club.id)))
      .catch(() => setAllowed(false));
  }, [ready, token, club, router]);

  useEffect(() => { if (allowed === false) router.replace('/'); }, [allowed, router]);

  if (!ready || !token || !club || allowed !== true) {
    return (
      <div style={{ minHeight: '100vh', background: th.bg, color: th.textFaint, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: th.fontUI }}>
        Chargement…
      </div>
    );
  }

  const links = [
    { href: '/admin',              label: 'Tableau de bord', icon: 'grid' as const },
    { href: '/admin/planning',     label: 'Planning',        icon: 'calendar' as const },
    { href: '/admin/courts',       label: 'Ressources',      icon: 'indoor' as const },
    { href: '/admin/sports',       label: 'Sports',          icon: 'bolt' as const },
    { href: '/admin/reservations', label: 'Réservations',    icon: 'ticket' as const },
    { href: '/admin/subscribers',  label: 'Abonnés',         icon: 'users' as const },
    { href: '/admin/announcements', label: 'Annonces',       icon: 'bolt' as const },
    { href: '/admin/sponsors',     label: 'Partenaires',     icon: 'users' as const },
    { href: '/admin/settings',     label: 'Réglages',        icon: 'settings' as const },
  ];

  return (
    <div style={{ minHeight: '100vh', background: th.bg, color: th.text, fontFamily: th.fontUI }}>
      <header style={{ position: 'sticky', top: 0, zIndex: 20, background: th.bgElev, borderBottom: `1px solid ${th.line}`, backdropFilter: 'blur(8px)' }}>
        <div style={{ maxWidth: 1080, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 20, padding: '14px 24px' }}>
          <Logotype size={20} />
          <span style={{ fontFamily: th.fontUI, fontSize: 12, fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase', color: th.textMute }}>Espace club</span>

          <nav style={{ display: 'flex', gap: 4, marginLeft: 12 }}>
            {links.map((l) => {
              const active = pathname === l.href;
              return (
                <Link key={l.href} href={l.href} style={{
                  display: 'flex', alignItems: 'center', gap: 7, padding: '7px 12px', borderRadius: 11, textDecoration: 'none',
                  fontFamily: th.fontUI, fontSize: 14, fontWeight: active ? 700 : 500,
                  background: active ? th.surface2 : 'transparent',
                  color: active ? th.text : th.textMute,
                }}>
                  <Icon name={l.icon} size={17} color={active ? th.accent : th.textMute} />{l.label}
                </Link>
              );
            })}
          </nav>

          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
            <ThemeToggle />
            <button onClick={logout}
              style={{ display: 'flex', alignItems: 'center', gap: 7, border: `1px solid ${th.line}`, background: 'transparent', cursor: 'pointer', borderRadius: 11, padding: '8px 12px', fontFamily: th.fontUI, fontSize: 13.5, color: th.textMute }}>
              <Icon name="logout" size={16} color={th.textMute} />Se déconnecter
            </button>
          </div>
        </div>
      </header>

      <main style={{ maxWidth: 1080, margin: '0 auto', padding: '28px 24px 48px' }}>{children}</main>
    </div>
  );
}
