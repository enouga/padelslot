'use client';
import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ClubDetail } from '@/lib/api';
import { useTheme } from '@/lib/ThemeProvider';
import { useAuth } from '@/lib/useAuth';
import { platformUrl } from '@/lib/clubUrl';
import { Logotype, ThemeToggle } from '@/components/ui/atoms';
import { ProfileMenu } from '@/components/ProfileMenu';
import { Icon, IconName } from '@/components/ui/Icon';

type Tab = { label: string; short?: string; href: string; icon: IconName; match: (p: string) => boolean; show: boolean; brand?: boolean };

// Barre de navigation club, présente sur toutes les pages d'un sous-domaine club.
// Rangée 1 : retour plateforme (‹ Palova, cross-sous-domaine) · identité club (titre) · thème/déconnexion.
// Rangée 2 : onglets Club-house (accueil du club, libellé en police brand) / Réserver / Events /
// Mes réservations (ou Connexion), onglet actif surligné.
export function ClubNav({ club }: { club: ClubDetail }) {
  const { th } = useTheme();
  const { token, ready } = useAuth();
  const pathname = usePathname();
  const [hovered, setHovered] = useState<string | null>(null);

  const tabs: Tab[] = [
    { label: 'Club-house', short: 'Club', href: '/', icon: 'home', brand: true, match: (p) => p === '/' || p.startsWith('/club-house') || p.startsWith('/infos'), show: true },
    { label: 'Réserver', href: '/reserver', icon: 'calendar', match: (p) => p.startsWith('/reserver') || p.startsWith('/courts'), show: true },
    { label: 'Events', href: '/events', icon: 'trophy', match: (p) => p.startsWith('/events') || p.startsWith('/tournois'), show: true },
    { label: 'Parties', href: '/parties', icon: 'users', match: (p) => p.startsWith('/parties'), show: ready && !!token },
    { label: 'Mes réservations', short: 'Résas', href: '/me/reservations', icon: 'ticket', match: (p) => p.startsWith('/me/'), show: ready && !!token },
    { label: 'Connexion', href: '/login', icon: 'user', match: (p) => p.startsWith('/login'), show: ready && !token },
  ];

  return (
    <div style={{ padding: '20px 20px 0' }}>
      {/* Mode téléphone (≤600px) : icône seule (plus grande, bien contrastée), libellé conservé pour
          l'onglet actif — en version COURTE (.cn-lbl-short) si l'onglet en a une, pour que la rangée
          tienne sur une ligne. Couleurs du thème injectées (l'icône colore en attribut SVG). */}
      <style>{`.cn-lbl-short{display:none}@media (max-width:600px){.cn-tab .cn-tab-label{display:none}.cn-tab.is-active .cn-tab-label:last-child{display:inline}.cn-tab svg{width:22px;height:22px}.cn-tab:not(.is-active) svg *{stroke:${th.text}}}`}</style>

      {/* Rangée 1 : marque Palova (→ accueil plateforme) · nom du club (titre) · actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Logotype href={platformUrl('/')} size={22} />
        <span style={{ flex: 1, minWidth: 0, fontFamily: th.fontDisplay, fontWeight: 600, fontSize: 18, color: th.text, letterSpacing: -0.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{club.name}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <ThemeToggle /><ProfileMenu />
        </div>
      </div>

      {/* Rangée 2 : onglets (icône seule sur téléphone ; passe à la ligne si ça ne tient pas, pas de rognage) */}
      <div className="cn-tabs" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 14 }}>
        {tabs.filter((t) => t.show).map((t) => {
          const active = t.match(pathname);
          const hov = !active && hovered === t.label;
          const iconColor = active ? th.onAccent : hov ? th.text : th.textMute;
          return (
            <Link key={t.label} href={t.href} aria-current={active ? 'page' : undefined}
              aria-label={t.label} title={t.label}
              className={`cn-tab${active ? ' is-active' : ''}`}
              onMouseEnter={() => setHovered(t.label)}
              onMouseLeave={() => setHovered((h) => (h === t.label ? null : h))}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, flex: 1, whiteSpace: 'nowrap', textDecoration: 'none',
                       boxSizing: 'border-box', padding: '8px 13px', borderRadius: 11,
                       border: `1px solid ${active ? 'transparent' : th.lineStrong}`,
                       fontFamily: th.fontUI, fontSize: 14, fontWeight: 600,
                       background: active ? th.accent : hov ? th.surfaceHi : th.surface2,
                       color: active ? th.onAccent : hov ? th.text : th.textMute,
                       transition: 'background .15s, border-color .15s, transform .12s, color .15s',
                       transform: hov ? 'translateY(-1px)' : 'none' }}>
              <Icon name={t.icon} size={16} color={iconColor} />
              {/* Righteous n'existe qu'en 400 → graisse normale, taille/espacement ajustés pour s'aligner sur les labels 14/600. */}
              <span className="cn-tab-label cn-lbl-full" style={t.brand ? { fontFamily: th.fontBrand, fontWeight: 400, fontSize: 15, letterSpacing: 0.2 } : undefined}>{t.label}</span>
              {t.short && (
                <span className="cn-tab-label cn-lbl-short" style={t.brand ? { fontFamily: th.fontBrand, fontWeight: 400, fontSize: 15, letterSpacing: 0.2 } : undefined}>{t.short}</span>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
