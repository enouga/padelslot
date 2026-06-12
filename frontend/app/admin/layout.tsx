'use client';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/useAuth';
import { useClub } from '@/lib/ClubProvider';
import { api } from '@/lib/api';
import { useTheme } from '@/lib/ThemeProvider';
import { Logotype, ThemeToggle } from '@/components/ui/atoms';
import { ProfileMenu } from '@/components/ProfileMenu';
import { Icon } from '@/components/ui/Icon';

// Permet à une page (ex. Planning) de replier la barre latérale et d'élargir le contenu.
export const AdminChromeContext = createContext<{ collapsed: boolean; setCollapsed: (v: boolean) => void }>({
  collapsed: false,
  setCollapsed: () => {},
});
export function useAdminChrome() { return useContext(AdminChromeContext); }

// Préférence persistante de repli de la sidebar (survit à la navigation et au rechargement).
const SIDEBAR_KEY = 'palova:admin-sidebar';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { th } = useTheme();
  const { token, ready } = useAuth();
  const { club } = useClub();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  // Pas de mismatch d'hydration : le premier rendu est « Chargement… », indépendant de cette valeur.
  const [collapsed, setCollapsedState] = useState(() =>
    typeof window !== 'undefined' && window.localStorage.getItem(SIDEBAR_KEY) === 'collapsed');
  const setCollapsed = useCallback((v: boolean) => {
    setCollapsedState(v);
    try { window.localStorage.setItem(SIDEBAR_KEY, v ? 'collapsed' : 'open'); } catch { /* stockage indisponible : préférence non persistée */ }
  }, []);

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
    { href: '/admin/caisse',       label: 'Caisse',          icon: 'ticket' as const },
    { href: '/admin/packages',     label: 'Offres prépayées', icon: 'bolt' as const },
    { href: '/admin/tournaments', label: 'Tournois',         icon: 'trophy' as const },
    { href: '/admin/events',       label: 'Events',          icon: 'bolt' as const },
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
          <span style={{ flex: 1, minWidth: 0, fontFamily: th.fontUI, fontSize: 14.5, fontWeight: 700, color: th.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{club.name}</span>
          <button type="button" aria-label="Masquer le menu" title="Masquer le menu" onClick={() => setCollapsed(true)} style={{
            marginLeft: 'auto', flexShrink: 0, width: 28, height: 28, borderRadius: 8, cursor: 'pointer',
            background: 'transparent', border: `1px solid ${th.line}`, color: th.textMute,
            fontSize: 14, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>⟨</button>
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

        <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', gap: 8, paddingTop: 16, borderTop: `1px solid ${th.line}` }}>
          <ThemeToggle />
          <ProfileMenu direction="up" align="left" />
        </div>
      </aside>
      )}

      <main style={{ flex: 1, minWidth: 0, maxWidth: collapsed ? '100%' : 1280, padding: collapsed ? '22px 30px 48px' : '28px 32px 48px' }}>
        {collapsed && (
          // height: 0 — le bouton flotte sans décaler le contenu ; sticky pour rester accessible en scrollant.
          <div style={{ position: 'sticky', top: 12, zIndex: 40, height: 0, marginLeft: -14 }}>
            <button type="button" aria-label="Afficher le menu" title="Afficher le menu" onClick={() => setCollapsed(false)} style={{
              width: 28, height: 28, borderRadius: 8, cursor: 'pointer',
              background: th.bgElev, border: `1px solid ${th.line}`, color: th.textMute,
              fontSize: 14, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>⟩</button>
          </div>
        )}
        {children}
      </main>
    </div>
    </AdminChromeContext.Provider>
  );
}
