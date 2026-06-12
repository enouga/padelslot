'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, assetUrl, MyClubMembership, MyProfile, Sex } from '@/lib/api';
import { useTheme } from '@/lib/ThemeProvider';
import { ThemeMode } from '@/lib/theme';
import { useAuth } from '@/lib/useAuth';
import { useClub } from '@/lib/ClubProvider';
import { Screen } from '@/components/ui/Screen';
import { BackButton, Segmented, ThemeToggle } from '@/components/ui/atoms';
import { ProfileMenu } from '@/components/ProfileMenu';
import { ClubNav } from '@/components/ClubNav';

const LOCALE_OPTIONS = [
  { value: 'fr', label: 'Français' },
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Español' },
];

const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

// Page profil dédiée : identité + avatar, infos modifiables (tél/naissance/sexe),
// préférences (langue stockée en base, thème local à l'appareil), licence du club courant.
export default function MyProfilePage() {
  const router = useRouter();
  const { th, mode, setMode } = useTheme();
  const { token, ready } = useAuth();
  const { slug, club } = useClub();

  const [profile, setProfile] = useState<MyProfile | null>(null);
  const [membership, setMembership] = useState<MyClubMembership | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Formulaire « Informations »
  const [phone, setPhone] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [sex, setSex] = useState<Sex | null>(null);
  const [savingInfo, setSavingInfo] = useState(false);
  const [savedInfo, setSavedInfo] = useState(false);

  // Avatar
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  // Préférences & licence
  const [savingLocale, setSavingLocale] = useState(false);
  const [license, setLicense] = useState('');
  const [savingLicense, setSavingLicense] = useState(false);
  const [savedLicense, setSavedLicense] = useState(false);

  useEffect(() => { if (ready && !token) router.replace('/login'); }, [ready, token, router]);

  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        setError(null);
        const p = await api.getMyProfile(token);
        setProfile(p);
        setPhone(p.phone ?? '');
        setBirthDate(p.birthDate ? p.birthDate.slice(0, 10) : '');
        setSex(p.sex);
        if (slug) {
          const m = await api.getMyClubMembership(slug, token).catch(() => null);
          setMembership(m);
          setLicense(m?.membershipNo ?? '');
        }
      } catch (e) { setError((e as Error).message); }
      finally { setLoading(false); }
    })();
  }, [token, slug]);

  const saveInfo = async () => {
    if (!token) return;
    setSavingInfo(true); setSavedInfo(false); setError(null);
    try {
      const p = await api.updateMyProfile({ phone: phone.trim() || null, sex, birthDate: birthDate || null }, token);
      setProfile(p);
      setSavedInfo(true);
    } catch (e) { setError((e as Error).message); }
    finally { setSavingInfo(false); }
  };

  const changeLocale = async (locale: string) => {
    if (!token || !profile) return;
    setSavingLocale(true); setError(null);
    setProfile({ ...profile, locale }); // optimiste : le select reflète le choix immédiatement
    try { setProfile(await api.updateMyProfile({ locale }, token)); }
    catch (e) { setError((e as Error).message); }
    finally { setSavingLocale(false); }
  };

  const saveLicense = async () => {
    if (!token || !slug) return;
    setSavingLicense(true); setSavedLicense(false); setError(null);
    try {
      setMembership(await api.updateMyClubMembership(slug, license.trim(), token));
      setSavedLicense(true);
    } catch (e) { setError((e as Error).message); }
    finally { setSavingLicense(false); }
  };

  const pickAvatar = async (file: File | undefined) => {
    if (!file || !token) return;
    if (!AVATAR_TYPES.includes(file.type)) { setError('Format d’image non supporté (JPEG, PNG ou WebP)'); return; }
    if (file.size > MAX_AVATAR_BYTES) { setError('Image trop lourde (2 Mo max)'); return; }
    setError(null);
    setPreview(URL.createObjectURL(file));
    setUploading(true);
    try { setProfile(await api.uploadMyAvatar(file, token)); }
    catch (e) { setError((e as Error).message); setPreview(null); }
    finally { setUploading(false); }
  };

  if (!ready || !token) return null;

  const card: React.CSSProperties = {
    background: th.surface, borderRadius: 20, boxShadow: `inset 0 0 0 1px ${th.line}`,
    padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 12,
  };
  const cardTitle: React.CSSProperties = {
    fontFamily: th.fontUI, fontSize: 11, fontWeight: 600, letterSpacing: 0.5,
    textTransform: 'uppercase', color: th.textFaint,
  };
  const label: React.CSSProperties = { fontFamily: th.fontUI, fontSize: 12.5, fontWeight: 600, color: th.textMute };
  const input: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box', background: th.surface2, border: `1px solid ${th.line}`,
    borderRadius: 11, padding: '10px 12px', fontFamily: th.fontUI, fontSize: 14, color: th.text,
  };
  const primaryBtn = (busy: boolean): React.CSSProperties => ({
    cursor: 'pointer', border: 'none', background: th.accent, color: th.onAccent, borderRadius: 11,
    padding: '10px 18px', fontFamily: th.fontUI, fontWeight: 700, fontSize: 13.5, opacity: busy ? 0.6 : 1, alignSelf: 'flex-start',
  });
  const readonlyRow = (l: string, v: string) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontFamily: th.fontUI, fontSize: 14 }}>
      <span style={{ color: th.textMute }}>{l}</span>
      <span style={{ color: th.text, fontWeight: 600, textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis' }}>{v}</span>
    </div>
  );

  const avatarSrc = preview ?? assetUrl(profile?.avatarUrl ?? null);
  const initials = profile ? `${profile.firstName[0] ?? ''}${profile.lastName[0] ?? ''}`.toUpperCase() : '…';

  return (
    <Screen>
      <div style={{ paddingBottom: 48 }}>
        {slug && club ? (
          <ClubNav club={club} />
        ) : (
          <div style={{ padding: '28px 20px 6px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <BackButton href="/clubs" />
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <ThemeToggle />
                <ProfileMenu />
              </div>
            </div>
          </div>
        )}

        <div style={{ padding: '18px 20px 0', fontFamily: th.fontDisplay, fontWeight: 500, fontSize: 38, lineHeight: 1.05, color: th.text, letterSpacing: -0.5 }}>
          Mon profil
        </div>

        {error && (
          <div style={{ margin: '14px 20px 0', fontFamily: th.fontUI, fontSize: 13, fontWeight: 600, color: th.onAccent, background: th.accent, borderRadius: 12, padding: '10px 14px' }}>
            {error}
          </div>
        )}

        {loading || !profile ? (
          <div style={{ padding: '24px 20px', fontFamily: th.fontUI, color: th.textFaint }}>Chargement…</div>
        ) : (
          <div style={{ padding: '18px 20px 0', display: 'flex', flexDirection: 'column', gap: 14 }}>

            {/* Identité + avatar */}
            <section style={card} aria-label="Identité">
              <div style={cardTitle}>Identité</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                {avatarSrc ? (
                  <img src={avatarSrc} alt="Photo de profil" style={{ width: 84, height: 84, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, opacity: uploading ? 0.5 : 1 }} />
                ) : (
                  <span aria-hidden="true" style={{
                    width: 84, height: 84, borderRadius: '50%', flexShrink: 0, background: th.accent, color: th.onAccent,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: th.fontUI, fontWeight: 700, fontSize: 28,
                  }}>{initials}</span>
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" style={{ display: 'none' }}
                    aria-label="Choisir une photo de profil"
                    onChange={(e) => { pickAvatar(e.target.files?.[0]); e.target.value = ''; }} />
                  <button onClick={() => fileRef.current?.click()} disabled={uploading} style={primaryBtn(uploading)}>
                    {uploading ? 'Envoi…' : 'Changer la photo'}
                  </button>
                  <span style={{ fontFamily: th.fontUI, fontSize: 12, color: th.textFaint }}>JPEG, PNG ou WebP · 2 Mo max</span>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 4 }}>
                {readonlyRow('Prénom', profile.firstName)}
                {readonlyRow('Nom', profile.lastName)}
                {readonlyRow('Email', profile.email)}
                <span style={{ fontFamily: th.fontUI, fontSize: 12, color: th.textFaint }}>L’email ne peut pas être modifié.</span>
              </div>
            </section>

            {/* Informations modifiables */}
            <section style={card} aria-label="Informations">
              <div style={cardTitle}>Informations</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={label}>Téléphone</span>
                <input value={phone} onChange={(e) => { setPhone(e.target.value); setSavedInfo(false); }} placeholder="06 09 03 26 35" aria-label="Téléphone" style={input} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={label}>Date de naissance</span>
                <input type="date" value={birthDate} onChange={(e) => { setBirthDate(e.target.value); setSavedInfo(false); }} aria-label="Date de naissance" style={input} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={label}>Sexe</span>
                <div style={{ display: 'flex', gap: 8 }}>
                  {(['MALE', 'FEMALE'] as const).map((s) => (
                    <button key={s} onClick={() => { setSex(s); setSavedInfo(false); }}
                      style={{ flex: 1, cursor: 'pointer', borderRadius: 11, padding: '10px', fontFamily: th.fontUI, fontSize: 13.5, border: `1px solid ${sex === s ? th.accent : th.line}`, background: sex === s ? th.surface2 : 'transparent', color: th.text }}>
                      {s === 'MALE' ? 'Homme' : 'Femme'}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <button onClick={saveInfo} disabled={savingInfo} style={primaryBtn(savingInfo)}>Enregistrer</button>
                {savedInfo && <span style={{ fontFamily: th.fontUI, fontSize: 13, fontWeight: 600, color: th.textMute }}>Enregistré ✓</span>}
              </div>
            </section>

            {/* Préférences */}
            <section style={card} aria-label="Préférences">
              <div style={cardTitle}>Préférences</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={label}>Langue</span>
                <select value={profile.locale ?? 'fr'} onChange={(e) => changeLocale(e.target.value)} disabled={savingLocale} aria-label="Langue" style={{ ...input, cursor: 'pointer' }}>
                  {LOCALE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <span style={{ fontFamily: th.fontUI, fontSize: 12, color: th.textFaint }}>L’interface reste en français pour l’instant.</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={label}>Thème</span>
                <Segmented<ThemeMode> value={mode} onChange={setMode}
                  options={[{ value: 'daylight', label: 'Clair' }, { value: 'floodlit', label: 'Sombre' }]} />
              </div>
            </section>

            {/* Licence du club courant (uniquement membre, sur un sous-domaine club) */}
            {slug && club && membership && (
              <section style={card} aria-label="Licence">
                <div style={cardTitle}>Licence · {club.name}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={label}>N° de licence / adhérent</span>
                  <input value={license} onChange={(e) => { setLicense(e.target.value); setSavedLicense(false); }} placeholder="N° de licence / adhérent" aria-label="N° de licence / adhérent" style={input} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <button onClick={saveLicense} disabled={savingLicense} style={primaryBtn(savingLicense)}>Enregistrer</button>
                  {savedLicense && <span style={{ fontFamily: th.fontUI, fontSize: 13, fontWeight: 600, color: th.textMute }}>Enregistré ✓</span>}
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </Screen>
  );
}
