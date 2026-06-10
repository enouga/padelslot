'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { api, ClubDetail } from '@/lib/api';
import { useTheme } from '@/lib/ThemeProvider';
import { useAuth } from '@/lib/useAuth';
import { platformUrl } from '@/lib/clubUrl';
import { Logotype, Chip, ThemeToggle, LogoutButton } from '@/components/ui/atoms';
import { Icon, IconName } from '@/components/ui/Icon';

type Tab = { label: string; href: string; icon: IconName; match: (p: string) => boolean; show: boolean };

// Barre de navigation club, présente sur toutes les pages d'un sous-domaine club.
// Rangée 1 : retour plateforme (‹ Palova, cross-sous-domaine) · identité club (→ réservation) · thème/déconnexion.
// Rangée 2 : onglets Réserver / Tournois / Mes réservations (ou Connexion) / Infos, onglet actif surligné.
export function ClubNav({ club }: { club: ClubDetail }) {
  const { th } = useTheme();
  const { token, ready } = useAuth();
  const pathname = usePathname();
  const [isSub, setIsSub] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let active = true;
    api.getMyMemberships(token)
      .then((ms) => { if (active) setIsSub(ms.some((m) => m.clubId === club.id && m.isSubscriber)); })
      .catch(() => {});
    return () => { active = false; };
  }, [token, club.id]);

  const tabs: Tab[] = [
    { label: 'Réserver', href: '/', icon: 'calendar', match: (p) => p === '/' || p.startsWith('/reserver') || p.startsWith('/courts'), show: true },
    { label: 'Tournois', href: '/tournois', icon: 'trophy', match: (p) => p.startsWith('/tournois'), show: true },
    { label: 'Mes réservations', href: '/me/reservations', icon: 'ticket', match: (p) => p.startsWith('/me/'), show: ready && !!token },
    { label: 'Connexion', href: '/login', icon: 'user', match: (p) => p.startsWith('/login'), show: ready && !token },
    { label: 'Infos', href: '/infos', icon: 'info', match: (p) => p.startsWith('/infos'), show: true },
  ];

  return (
    <div style={{ padding: '20px 20px 0' }}>
      {/* Mode téléphone (≤600px) : icône seule (plus grande, bien contrastée), libellé conservé pour
          l'onglet actif. Couleurs du thème injectées (l'icône colore en attribut SVG). */}
      <style>{`@media (max-width:600px){.cn-tab .cn-tab-label{display:none}.cn-tab.is-active .cn-tab-label{display:inline}.cn-tab svg{width:22px;height:22px}.cn-tab:not(.is-active) svg *{stroke:${th.text}}}`}</style>

      {/* Rangée 1 : marque Palova (→ accueil plateforme) · nom du club (titre) · actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Logotype href={platformUrl('/')} size={22} />
        <span style={{ flex: 1, minWidth: 0, fontFamily: th.fontDisplay, fontWeight: 600, fontSize: 18, color: th.text, letterSpacing: -0.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{club.name}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {token && isSub && <Chip tone="accent" icon="check">Abonné</Chip>}
          <ThemeToggle /><LogoutButton />
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
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0, textDecoration: 'none',
                       boxSizing: 'border-box', padding: '8px 13px', borderRadius: 11,
                       border: `1px solid ${active ? 'transparent' : th.lineStrong}`,
                       fontFamily: th.fontUI, fontSize: 14, fontWeight: 600,
                       background: active ? th.accent : hov ? th.surfaceHi : th.surface2,
                       color: active ? th.onAccent : hov ? th.text : th.textMute,
                       transition: 'background .15s, border-color .15s, transform .12s, color .15s',
                       transform: hov ? 'translateY(-1px)' : 'none' }}>
              <Icon name={t.icon} size={16} color={iconColor} /><span className="cn-tab-label">{t.label}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
