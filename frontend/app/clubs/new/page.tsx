'use client';
import { useState, useEffect, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { api, Sport } from '@/lib/api';
import { useTheme } from '@/lib/ThemeProvider';
import { setSession } from '@/lib/session';
import { clubUrl } from '@/lib/clubUrl';
import { Screen } from '@/components/ui/Screen';
import { Logotype, Btn, Field, ThemeToggle } from '@/components/ui/atoms';

export default function NewClubPage() {
  const router = useRouter();
  const { th } = useTheme();

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName]   = useState('');
  const [email, setEmail]         = useState('');
  const [password, setPassword]   = useState('');
  const [clubName, setClubName]   = useState('');
  const [city, setCity]           = useState('');
  const [sports, setSports]       = useState<Sport[]>([]);
  const [sportId, setSportId]     = useState('');
  const [error, setError]         = useState<string | null>(null);
  const [loading, setLoading]     = useState(false);

  useEffect(() => {
    api.getSports().then((s) => { setSports(s); if (s[0]) setSportId(s[0].id); }).catch(() => setSports([]));
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) { setError('Mot de passe : 8 caractères minimum.'); return; }
    setLoading(true);
    try {
      const { token } = await api.register({ email, password, firstName, lastName });
      const club = await api.createClub({ name: clubName, city: city || undefined }, token);
      if (sportId) {
        try { await api.adminAddSport(club.id, sportId, token); } catch { /* sport activable plus tard */ }
      }
      setSession(token, club.id);
      window.location.assign(clubUrl(club.slug, '/admin')); // bascule sur le sous-domaine du nouveau club
    } catch (err) {
      const msg = (err as Error).message;
      setError(
        msg.includes('déjà utilisé') ? 'Cet email a déjà un compte. Connectez-vous, puis créez votre club.'
        : msg === 'SLUG_TAKEN' ? 'Un club porte déjà ce nom. Essayez une variante.'
        : msg === 'VALIDATION_ERROR' ? 'Champs invalides.'
        : msg,
      );
    } finally {
      setLoading(false);
    }
  }

  const labelStyle = { fontFamily: th.fontUI, fontSize: 12.5, fontWeight: 600, letterSpacing: 0.4, textTransform: 'uppercase' as const, color: th.textMute, display: 'block', marginBottom: 8 };

  return (
    <Screen>
      <form onSubmit={handleSubmit} style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', padding: '0 24px 40px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 28 }}>
          <Logotype size={24} />
          <ThemeToggle />
        </div>

        <div style={{ paddingTop: 36, paddingBottom: 28 }}>
          <div style={{ fontFamily: th.fontDisplay, fontWeight: 500, fontSize: 40, lineHeight: 1.04, color: th.text, letterSpacing: -0.5 }}>
            Créez l'espace<br />de <span style={{ fontStyle: 'italic' }}>votre</span> club.
          </div>
          <div style={{ fontFamily: th.fontUI, fontSize: 15, color: th.textMute, marginTop: 14, lineHeight: 1.5, maxWidth: 320 }}>
            Quelques infos et votre club est en ligne. Vous gérez ensuite tout vous-même : sports, terrains, tarifs, réservations.
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {error && (
            <div style={{ fontFamily: th.fontUI, fontSize: 13.5, color: th.onAccent, background: th.accent, padding: '11px 14px', borderRadius: 12, fontWeight: 600 }}>{error}</div>
          )}

          <div style={{ fontFamily: th.fontUI, fontSize: 12, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: th.textFaint, marginTop: 4 }}>Gérant</div>
          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ flex: 1 }}><Field label="Prénom" value={firstName} onChange={setFirstName} required autoComplete="given-name" /></div>
            <div style={{ flex: 1 }}><Field label="Nom" value={lastName} onChange={setLastName} required autoComplete="family-name" /></div>
          </div>
          <Field label="Adresse e-mail" icon="mail" type="email" value={email} onChange={setEmail} required autoComplete="email" />
          <Field label="Mot de passe (8+ caractères)" icon="lock" type="password" value={password} onChange={setPassword} required autoComplete="new-password" />

          <div style={{ fontFamily: th.fontUI, fontSize: 12, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: th.textFaint, marginTop: 8 }}>Club</div>
          <Field label="Nom du club" icon="pin" value={clubName} onChange={setClubName} required />
          <Field label="Ville" value={city} onChange={setCity} />
          <label style={{ display: 'block' }}>
            <span style={labelStyle}>Sport principal</span>
            <select value={sportId} onChange={(e) => setSportId(e.target.value)}
              style={{ width: '100%', height: 54, padding: '0 16px', borderRadius: 14, background: th.surface, color: th.text, border: 'none', boxShadow: `inset 0 0 0 1.5px ${th.line}`, fontFamily: th.fontUI, fontSize: 16 }}>
              {sports.map((s) => <option key={s.id} value={s.id}>{s.icon ? `${s.icon} ` : ''}{s.name}</option>)}
            </select>
          </label>

          <div style={{ height: 4 }} />
          <Btn type="submit" full icon="arrowR" disabled={loading}>
            {loading ? 'Création…' : 'Créer mon club'}
          </Btn>
          <button type="button" onClick={() => router.push('/login')}
            style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: th.fontUI, fontSize: 14, color: th.textMute, padding: '6px 0' }}>
            Vous avez déjà un compte ? <span style={{ color: th.text, fontWeight: 700, textDecoration: 'underline', textUnderlineOffset: 3 }}>Se connecter</span>
          </button>
        </div>
      </form>
    </Screen>
  );
}
