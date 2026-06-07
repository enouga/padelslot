'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { api, ManagedClub, PlayerMembership } from '@/lib/api';
import { clubUrl } from '@/lib/clubUrl';
import { useAuth } from '@/lib/useAuth';
import { useTheme } from '@/lib/ThemeProvider';
import { Screen } from '@/components/ui/Screen';
import { Logotype, Btn, ThemeToggle, Chip, MyBookingsButton, LogoutButton } from '@/components/ui/atoms';
import { Icon } from '@/components/ui/Icon';
import { ClubDirectory } from '@/components/ClubDirectory';
import { ClubCard } from '@/components/ClubCard';

const SPORTS = ['Padel', 'Tennis', 'Pickleball', 'Squash', 'Badminton', 'Ping-pong'];

// Accueil plateforme (palova.fr) adaptatif selon le rôle :
//  - visiteur : hero + créer un compte + annuaire + créer un club
//  - joueur connecté : ses clubs + annuaire
//  - gérant connecté : écran de redirection vers l'admin de ses clubs
export default function PlatformLanding() {
  const { token, ready } = useAuth();
  const [managed, setManaged] = useState<ManagedClub[] | null>(null); // null = non résolu

  useEffect(() => {
    if (!ready) return;
    if (!token) { setManaged([]); return; }                 // visiteur : pas de fetch de rôle
    api.getMyClubs(token).then(setManaged).catch(() => setManaged([])); // erreur → repli joueur
  }, [ready, token]);

  // Anti-flash : on attend l'auth (ready) et, si connecté, la résolution du rôle (getMyClubs).
  if (!ready || (token && managed === null)) return <PlatformSkeleton />;
  if (!token) return <AnonymousView />;
  if (managed && managed.length > 0) return <ManagerView clubs={managed} />;
  return <PlayerView token={token} />;
}

function Header({ children }: { children?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 28 }}>
      <Logotype size={26} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>{children}<ThemeToggle /></div>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  const { th } = useTheme();
  return (
    <div style={{ fontFamily: th.fontUI, fontSize: 12.5, fontWeight: 600, letterSpacing: 0.4, textTransform: 'uppercase', color: th.textMute, padding: '0 20px', marginTop: 8 }}>
      {children}
    </div>
  );
}

function PlatformSkeleton() {
  const { th } = useTheme();
  return (
    <Screen>
      <div style={{ padding: '0 24px' }}><Header /></div>
      <div style={{ minHeight: '50vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: th.fontUI, color: th.textFaint }}>Chargement…</div>
    </Screen>
  );
}

function AnonymousView() {
  const router = useRouter();
  const { th } = useTheme();
  return (
    <Screen>
      <div style={{ paddingBottom: 40 }}>
        <div style={{ padding: '0 24px' }}>
          <Header />

          {/* hero */}
          <div style={{ paddingTop: 48 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 18 }}>
              <span style={{ position: 'relative', display: 'inline-flex', width: 8, height: 8 }}>
                <span style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: th.accent, animation: 'sp-ping 1.8s cubic-bezier(0,0,0.2,1) infinite' }} />
                <span style={{ position: 'relative', width: 8, height: 8, borderRadius: '50%', background: th.accent }} />
              </span>
              <span style={{ fontFamily: th.fontUI, fontSize: 13, fontWeight: 600, letterSpacing: 0.4, textTransform: 'uppercase', color: th.textMute }}>
                Réservation en temps réel
              </span>
            </div>

            <h1 style={{ fontFamily: th.fontDisplay, fontWeight: 500, fontSize: 52, lineHeight: 1.02, color: th.text, letterSpacing: -0.5, margin: 0 }}>
              Le terrain<br />que vous voulez,<br /><span style={{ fontStyle: 'italic' }}>quand</span> vous voulez.
            </h1>

            <p style={{ fontFamily: th.fontUI, fontSize: 16, color: th.textMute, marginTop: 18, lineHeight: 1.5, maxWidth: 340 }}>
              Réservez un créneau dans votre club en quelques secondes — padel, tennis, pickleball et plus. Disponibilités en direct, créneau bloqué 10 min le temps de confirmer.
            </p>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 22 }}>
              {SPORTS.map((s) => <Chip key={s} tone="line">{s}</Chip>)}
            </div>
          </div>

          {/* CTAs */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 32 }}>
            <Btn full icon="user" onClick={() => router.push('/register')}>Créer un compte</Btn>
            <Btn full variant="ghost" icon="arrowR" onClick={() => router.push('/login')}>Se connecter</Btn>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center', marginTop: 4 }}>
              <Icon name="indoor" size={15} color={th.textFaint} />
              <span style={{ fontFamily: th.fontUI, fontSize: 13, color: th.textMute }}>
                Vous gérez un club ?{' '}
                <button onClick={() => router.push('/clubs/new')}
                  style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: th.fontUI, fontSize: 13, fontWeight: 700, color: th.text, textDecoration: 'underline', textUnderlineOffset: 3, padding: 0 }}>
                  Créer mon club
                </button>
              </span>
            </div>
          </div>
        </div>

        {/* annuaire intégré */}
        <div style={{ marginTop: 36 }}>
          <SectionTitle>Parcourir les clubs</SectionTitle>
          <ClubDirectory />
        </div>
      </div>
    </Screen>
  );
}

function PlayerView({ token }: { token: string }) {
  const { th } = useTheme();
  const [mine, setMine] = useState<PlayerMembership[] | null>(null);

  useEffect(() => { api.getMyMemberships(token).then(setMine).catch(() => setMine([])); }, [token]);

  return (
    <Screen>
      <div style={{ paddingBottom: 40 }}>
        <div style={{ padding: '0 24px' }}>
          <Header><MyBookingsButton /><LogoutButton /></Header>
          <div style={{ fontFamily: th.fontDisplay, fontWeight: 500, fontSize: 38, lineHeight: 1.05, color: th.text, marginTop: 22, letterSpacing: -0.5 }}>
            Vos clubs.
          </div>
        </div>

        {/* mes clubs */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '20px 20px 0' }}>
          {mine === null ? (
            <div style={{ padding: '20px 0', textAlign: 'center', fontFamily: th.fontUI, color: th.textFaint }}>Chargement…</div>
          ) : mine.length === 0 ? (
            <div style={{ padding: '14px 16px', borderRadius: 14, background: th.surface2, fontFamily: th.fontUI, fontSize: 14, color: th.textMute }}>
              Vous n&apos;avez pas encore rejoint de club. Trouvez-en un ci-dessous.
            </div>
          ) : (
            mine.map((m) => <ClubCard key={m.clubId} club={m.club} />)
          )}
        </div>

        {/* annuaire */}
        <div style={{ marginTop: 30 }}>
          <SectionTitle>Trouver un autre club</SectionTitle>
          <ClubDirectory />
        </div>
      </div>
    </Screen>
  );
}

function ManagerView({ clubs }: { clubs: ManagedClub[] }) {
  const { th } = useTheme();
  return (
    <Screen>
      <div style={{ padding: '0 24px 40px' }}>
        <Header><LogoutButton /></Header>
        <div style={{ fontFamily: th.fontDisplay, fontWeight: 500, fontSize: 44, lineHeight: 1.04, color: th.text, marginTop: 40, letterSpacing: -0.5 }}>
          Vos clubs.
        </div>
        <p style={{ fontFamily: th.fontUI, fontSize: 15.5, color: th.textMute, marginTop: 12, lineHeight: 1.5 }}>
          Accédez au back-office de {clubs.length > 1 ? 'vos clubs' : 'votre club'}.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 28 }}>
          {clubs.map((c) => (
            <Btn key={c.clubId} full icon="arrowR" onClick={() => window.location.assign(clubUrl(c.slug, '/admin'))}>
              Aller à l&apos;admin de {c.name}
            </Btn>
          ))}
        </div>
      </div>
    </Screen>
  );
}
