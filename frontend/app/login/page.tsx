'use client';
import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useTheme } from '@/lib/ThemeProvider';
import { Screen } from '@/components/ui/Screen';
import { Logotype, Btn, Field, ThemeToggle } from '@/components/ui/atoms';

export default function LoginPage() {
  const router = useRouter();
  const { th } = useTheme();
  const [email, setEmail] = useState('test@padelconnect.fr');
  const [password, setPassword] = useState('password123');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Erreur de connexion');
        return;
      }
      localStorage.setItem('token', data.token);
      localStorage.setItem('role', data.user.role);
      localStorage.setItem('clubId', data.user.clubId ?? '');
      router.push(data.user.role === 'CLUB_ADMIN' ? '/admin' : '/courts');
    } catch {
      setError('Impossible de contacter le serveur');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen>
      <form onSubmit={handleSubmit} style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', padding: '0 24px 40px' }}>
        {/* header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 28 }}>
          <Logotype size={26} />
          <ThemeToggle />
        </div>

        {/* hero */}
        <div style={{ paddingTop: 48, paddingBottom: 40 }}>
          <div style={{ fontFamily: th.fontDisplay, fontWeight: 500, fontSize: 46, lineHeight: 1.04, color: th.text, letterSpacing: -0.5 }}>
            Réservez votre<br />terrain en<br /><span style={{ fontStyle: 'italic' }}>quelques</span> secondes.
          </div>
          <div style={{ fontFamily: th.fontUI, fontSize: 15.5, color: th.textMute, marginTop: 16, lineHeight: 1.5, maxWidth: 300 }}>
            Disponibilités en direct, créneaux bloqués 10 minutes le temps de confirmer.
          </div>
        </div>

        {/* form */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 'auto' }}>
          {error && (
            <div style={{
              fontFamily: th.fontUI, fontSize: 13.5, color: th.onAccent, background: th.accent,
              padding: '11px 14px', borderRadius: 12, fontWeight: 600,
            }}>{error}</div>
          )}
          <Field label="Adresse e-mail" icon="mail" type="email" value={email} onChange={setEmail} required autoComplete="email" />
          <Field label="Mot de passe" icon="lock" type="password" value={password} onChange={setPassword} required autoComplete="current-password" />
          <div style={{ height: 4 }} />
          <Btn type="submit" full icon="arrowR" disabled={loading}>
            {loading ? 'Connexion…' : 'Se connecter'}
          </Btn>
        </div>
      </form>
    </Screen>
  );
}
