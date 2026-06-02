'use client';

import { useRouter } from 'next/navigation';
import { useTheme } from '@/lib/ThemeProvider';
import { Screen } from '@/components/ui/Screen';
import { Logotype, Btn, ThemeToggle, Chip } from '@/components/ui/atoms';
import { Icon } from '@/components/ui/Icon';

const SPORTS = ['Padel', 'Tennis', 'Pickleball', 'Squash', 'Badminton', 'Ping-pong'];

export default function PlatformLanding() {
  const router = useRouter();
  const { th } = useTheme();

  return (
    <Screen>
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', padding: '0 24px 40px' }}>
        {/* header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 28 }}>
          <Logotype size={26} />
          <ThemeToggle />
        </div>

        {/* hero */}
        <div style={{ paddingTop: 56 }}>
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

          {/* sport chips */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 22 }}>
            {SPORTS.map((s) => <Chip key={s} tone="line">{s}</Chip>)}
          </div>
        </div>

        {/* CTAs */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 'auto', paddingTop: 48 }}>
          <Btn full icon="arrowR" onClick={() => router.push('/clubs')}>Trouver un club</Btn>
          <Btn full variant="ghost" icon="user" onClick={() => router.push('/login')}>Se connecter</Btn>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center', marginTop: 8 }}>
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
    </Screen>
  );
}
