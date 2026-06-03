'use client';
import { createContext, useContext, useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { useAuth, logout } from '@/lib/useAuth';
import { useClub } from '@/lib/ClubProvider';
import { api } from '@/lib/api';
import { useTheme } from '@/lib/ThemeProvider';
import { Logotype, ThemeToggle } from '@/components/ui/atoms';
import { Icon } from '@/components/ui/Icon';

// Permet à une page (ex. Planning) de replier la barre latérale et d'élargir le contenu.
export const AdminChromeContext = createContext<{ collapsed: boolean; setCollapsed: (v: boolean) => void }>({
  collapsed: false,
  setCollapsed: () => {},
});
export function useAdminChrome() { return useContext(AdminChromeContext); }

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { th } = useTheme();
  const { token, ready } = useAuth();
  const { club } = useClub();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [collapsed, setCollapsed] = useState(false);

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
    { href: '/admin/members',      label: 'Membres',         icon: 'users' as const },
    { href: '/admin/announcements', label: 'Annonces',       icon: 'bolt' as const },
    { href: '/admin/sponsors',     label: 'Partenaires',     icon: 'users' as const },
    { href: '/admin/settings',     label: 'Réglages',        icon: 'settings' as const },
  ];

  return (
    <AdminChromeContext.Provider value={{ collapsed, setCollapsed }}>
    <div style={{ minHeight: '100vh', background: th.bg, color: th.text, fontFamily: th.fontUI, display: 'flex' }}>
      {!collapsed && (
      <aside style={{
        position: 'sticky', top: 0, alignSelf: 'flex-start', height: '100vh',
        width: 244, flexShrink: 0, boxSizing: 'border-box',
        background: th.bgElev, borderRight: `1px solid ${th.line}`,
        display: 'flex', flexDirection: 'column', padding: '20px 14px',
      }}>
        {/* marque + identité club */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 8px 6px' }}>
          {club.logoUrl
            ? <img src={club.logoUrl} alt={club.name} style={{ width: 34, height: 34, borderRadius: 9, objectFit: 'cover', flexShrink: 0 }} />
            : <Logotype size={22} />}
          {club.logoUrl && (
            <span style={{ fontFamily: th.fontUI, fontSize: 14.5, fontWeight: 700, color: th.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{club.name}</span>
          )}
        </div>
        <div style={{ fontFamily: th.fontUI, fontSize: 11, fontWeight: 600, letterSpacing: 0.6, textTransform: 'uppercase', color: th.textFaint, padding: '6px 10px 14px' }}>Espace club</div>

        <nav style={{ display: 'flex', flexDirection: 'column', gap: 3, overflowY: 'auto' }}>
          {links.map((l) => {
            const active = pathname === l.href;
            return (
              <Link key={l.href} href={l.href} style={{
                display: 'flex', alignItems: 'center', gap: 11, padding: '9px 12px', borderRadius: 11, textDecoration: 'none',
                fontFamily: th.fontUI, fontSize: 14, fontWeight: active ? 700 : 500,
                background: active ? th.surface2 : 'transparent',
                color: active ? th.text : th.textMute,
              }}>
                <Icon name={l.icon} size={18} color={active ? th.accent : th.textMute} />{l.label}
              </Link>
            );
          })}
        </nav>

        <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 16, borderTop: `1px solid ${th.line}` }}>
          <ThemeToggle />
          <button onClick={logout}
            style={{ display: 'flex', alignItems: 'center', gap: 9, border: `1px solid ${th.line}`, background: 'transparent', cursor: 'pointer', borderRadius: 11, padding: '9px 12px', fontFamily: th.fontUI, fontSize: 13.5, color: th.textMute }}>
            <Icon name="logout" size={16} color={th.textMute} />Se déconnecter
          </button>
        </div>
      </aside>
      )}

      <main style={{ flex: 1, minWidth: 0, maxWidth: collapsed ? '100%' : 1080, padding: collapsed ? '22px 30px 48px' : '28px 32px 48px' }}>{children}</main>
    </div>
    </AdminChromeContext.Provider>
  );
}
