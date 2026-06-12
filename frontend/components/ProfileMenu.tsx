'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, assetUrl, ManagedClub, MemberPackage, MyClubMembership, MyProfile } from '@/lib/api';
import { useTheme } from '@/lib/ThemeProvider';
import { Theme } from '@/lib/theme';
import { useAuth, logout } from '@/lib/useAuth';
import { useInstallPrompt } from '@/lib/useInstallPrompt';
import { useClub } from '@/lib/ClubProvider';
import { platformUrl } from '@/lib/clubUrl';
import { packageLabel, isUsable } from '@/lib/packages';
import { Icon, IconName } from '@/components/ui/Icon';
import { Chip } from '@/components/ui/atoms';

// Icône profil (header) + menu déroulant : identité, soldes prépayés du club courant,
// liens (page profil, résas, clubs, back-office, superadmin), déconnexion.
// L'édition du profil vit sur la page dédiée /me/profile.
// Ne s'affiche que connecté. `direction="up"` ouvre le panneau vers le haut (pieds de sidebar) ;
// `align="left"` l'aligne sur le bord gauche du bouton pour qu'il s'étende vers la droite
// (sidebar collée au bord gauche de l'écran, sinon le panneau sortirait de l'écran).
export function ProfileMenu({ direction = 'down', align = 'right' }: { direction?: 'down' | 'up'; align?: 'left' | 'right' }) {
  const { th } = useTheme();
  const { token, ready } = useAuth();
  const { slug, club } = useClub();
  const router = useRouter();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [profile, setProfile] = useState<MyProfile | null>(null);
  const [managed, setManaged] = useState<ManagedClub[]>([]);
  // undefined = en cours de chargement ; null = pas membre du club courant (ou hôte plateforme).
  const [membership, setMembership] = useState<MyClubMembership | null | undefined>(undefined);
  const [packages, setPackages] = useState<MemberPackage[]>([]);
  const { state: installState, promptInstall } = useInstallPrompt();
  const [iosHelp, setIosHelp] = useState(false);

  // Chargement paresseux à la première ouverture (échecs silencieux : section masquée).
  const toggle = () => {
    if (!open && !loaded && token) {
      setLoaded(true);
      api.getMyProfile(token).then(setProfile).catch(() => {});
      api.getMyClubs(token).then(setManaged).catch(() => {});
      if (slug) {
        api.getMyClubMembership(slug, token).then(setMembership).catch(() => setMembership(null));
        api.getMyClubPackages(slug, token).then(setPackages).catch(() => {});
      } else {
        setMembership(null);
      }
    }
    setOpen(!open);
  };

  // Fermeture : clic extérieur ou Échap.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  if (!ready || !token) return null;

  const isMember = membership !== undefined && membership !== null;
  const incomplete = profile != null && (!profile.phone || !profile.sex || (isMember && !membership.membershipNo));
  const soldes = packages.filter((p) => isUsable(p));
  const managesClub = !!club && managed.some((m) => m.clubId === club.id);
  const avatarSrc = assetUrl(profile?.avatarUrl ?? null);

  const go = (href: string) => { setOpen(false); router.push(href); };

  const sectionTitle: React.CSSProperties = { fontFamily: th.fontUI, fontSize: 11, fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase', color: th.textFaint, padding: '12px 16px 6px' };

  return (
    <div ref={wrapRef} style={{ position: 'relative', flexShrink: 0 }}>
      <button onClick={toggle} aria-label="Mon profil" aria-haspopup="menu" aria-expanded={open}
        style={{
          width: 38, height: 38, borderRadius: 12, border: 'none', cursor: 'pointer', flexShrink: 0,
          background: open ? th.surfaceHi : th.surface2, display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
        <Icon name="user" size={19} color={th.text} />
      </button>

      {open && (
        <div role="menu" aria-label="Mon profil" style={{
          position: 'absolute', ...(align === 'left' ? { left: 0 } : { right: 0 }), ...(direction === 'up' ? { bottom: 46 } : { top: 46 }),
          width: 300, zIndex: 60, background: th.surface, border: `1px solid ${th.line}`,
          borderRadius: 16, boxShadow: th.shadowSoft, overflow: 'hidden', paddingBottom: 8,
        }}>
          {/* Identité */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 16px 12px', borderBottom: `1px solid ${th.line}` }}>
            {avatarSrc ? (
              <img src={avatarSrc} alt="" style={{ width: 42, height: 42, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
            ) : (
              <span aria-hidden="true" style={{
                width: 42, height: 42, borderRadius: '50%', flexShrink: 0, background: th.accent, color: th.onAccent,
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: th.fontUI, fontWeight: 700, fontSize: 15,
              }}>
                {profile ? `${profile.firstName[0] ?? ''}${profile.lastName[0] ?? ''}`.toUpperCase() : '…'}
              </span>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: th.fontUI, fontWeight: 700, fontSize: 15, color: th.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {profile ? `${profile.firstName} ${profile.lastName}` : 'Chargement…'}
              </div>
              <div style={{ fontFamily: th.fontUI, fontSize: 12.5, color: th.textMute, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {profile?.email ?? ''}
              </div>
            </div>
            {isMember && membership.isSubscriber && <Chip tone="accent" icon="check">Abonné</Chip>}
          </div>

          {/* Soldes prépayés du club courant */}
          {soldes.length > 0 && (
            <div style={{ borderBottom: `1px solid ${th.line}`, paddingBottom: 10 }}>
              <div style={sectionTitle}>Mes soldes</div>
              <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 4, fontFamily: th.fontUI, fontSize: 13.5, color: th.textMute }}>
                {soldes.map((p) => <span key={p.id}>{packageLabel(p)}</span>)}
              </div>
            </div>
          )}

          {/* Liens */}
          <div style={{ paddingTop: 6 }}>
            <MenuItem th={th} icon="user" label={incomplete ? 'Mon profil · incomplet' : 'Mon profil'} onClick={() => go('/me/profile')} />
            <MenuItem th={th} icon="ticket" label="Mes réservations" onClick={() => go('/me/reservations')} />
            <MenuItem th={th} icon="search" label="Mes clubs" onClick={() => { setOpen(false); window.location.assign(platformUrl('/clubs')); }} />
            {managesClub && <MenuItem th={th} icon="settings" label="Espace club" onClick={() => go('/admin')} />}
            {profile?.isSuperAdmin && !slug && <MenuItem th={th} icon="grid" label="Superadmin" onClick={() => go('/superadmin')} />}
            {installState !== 'hidden' && (
              <MenuItem th={th} icon="home" label="Installer l'application"
                onClick={() => { setOpen(false); if (installState === 'native') promptInstall(); else setIosHelp(true); }} />
            )}
            <MenuItem th={th} icon="logout" label="Se déconnecter" onClick={() => { setOpen(false); logout(); }} />
          </div>
        </div>
      )}

      {/* Tutoriel iOS : pas de prompt natif sur Safari iOS, on guide vers « Sur l'écran d'accueil ». */}
      {iosHelp && (
        <div role="dialog" aria-label="Installer l'application" style={{
          position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(0,0,0,0.45)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
        }}>
          <div style={{ width: 340, maxWidth: '100%', background: th.surface, border: `1px solid ${th.line}`, borderRadius: 16, padding: 20, fontFamily: th.fontUI, color: th.text }}>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 10 }}>Installer l'application</div>
            <ol style={{ margin: 0, paddingLeft: 18, fontSize: 14, color: th.textMute, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <li>Ouvrez le menu <strong>Partager</strong> de Safari</li>
              <li>Choisissez <strong>« Sur l'écran d'accueil »</strong></li>
              <li>Validez avec <strong>Ajouter</strong></li>
            </ol>
            <button onClick={() => setIosHelp(false)} style={{
              marginTop: 14, width: '100%', padding: '10px 0', borderRadius: 10, border: 'none', cursor: 'pointer',
              background: th.accent, color: th.onAccent, fontFamily: th.fontUI, fontWeight: 700, fontSize: 14,
            }}>Compris</button>
          </div>
        </div>
      )}
    </div>
  );
}

function MenuItem({ th, icon, label, onClick }: { th: Theme; icon: IconName; label: string; onClick: () => void }) {
  return (
    <button role="menuitem" onClick={onClick}
      onMouseEnter={(e) => (e.currentTarget.style.background = th.surface2)}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
      style={{
        display: 'flex', alignItems: 'center', gap: 10, width: '100%', boxSizing: 'border-box',
        border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left',
        padding: '10px 16px', fontFamily: th.fontUI, fontSize: 14, fontWeight: 600, color: th.text,
      }}>
      <Icon name={icon} size={17} color={th.textMute} />{label}
    </button>
  );
}
