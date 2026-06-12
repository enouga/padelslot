'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { api, ManagedClub, PlayerMembership } from '@/lib/api';
import { clubUrl } from '@/lib/clubUrl';
import { useAuth } from '@/lib/useAuth';
import { useTheme } from '@/lib/ThemeProvider';
import { Screen } from '@/components/ui/Screen';
import { Logotype, Btn, ThemeToggle, MyBookingsButton } from '@/components/ui/atoms';
import { ProfileMenu } from '@/components/ProfileMenu';
import { ClubDirectory } from '@/components/ClubDirectory';
import { ClubCard } from '@/components/ClubCard';

// Accueil plateforme (palova.fr) selon le rôle — réservé aux connectés (verrou proxy.ts) :
//  - joueur connecté : ses clubs + annuaire
//  - gérant connecté : écran de redirection vers l'admin de ses clubs
export default function PlatformLanding() {
  const { token, ready } = useAuth();
  const router = useRouter();
  const [managed, setManaged] = useState<ManagedClub[] | null>(null); // null = non résolu

  useEffect(() => {
    if (!ready) return;
    if (!token) { router.replace('/login'); return; }        // repli : non connecté → connexion
    api.getMyClubs(token).then(setManaged).catch(() => setManaged([])); // erreur → repli joueur
  }, [ready, token, router]);

  // Anti-flash : squelette tant que l'auth n'est pas prête ou le rôle non résolu.
  if (!ready || !token || managed === null) return <PlatformSkeleton />;
  if (managed.length > 0) return <ManagerView clubs={managed} />;
  return <PlayerView token={token} />;
}

function Header({ children }: { children?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 28 }}>
      <Logotype size={26} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><ThemeToggle />{children}</div>
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

function PlayerView({ token }: { token: string }) {
  const { th } = useTheme();
  const [mine, setMine] = useState<PlayerMembership[] | null>(null);

  useEffect(() => { api.getMyMemberships(token).then(setMine).catch(() => setMine([])); }, [token]);

  return (
    <Screen>
      <div style={{ paddingBottom: 40 }}>
        <div style={{ padding: '0 24px' }}>
          <Header><MyBookingsButton /><ProfileMenu /></Header>
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
        <Header><ProfileMenu /></Header>
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
