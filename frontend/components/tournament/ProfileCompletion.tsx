'use client';
import { useState } from 'react';
import { useTheme } from '@/lib/ThemeProvider';

// Carte de complétion de profil : téléphone, licence et sexe sont requis
// pour s'inscrire à un tournoi.
export function ProfileCompletion({ busy, initialPhone, initialSex, initialLicense, onSave }: {
  busy: boolean;
  initialPhone: string;
  initialSex: 'MALE' | 'FEMALE' | '';
  initialLicense: string;
  onSave: (phone: string, sex: 'MALE' | 'FEMALE', license: string) => void;
}) {
  const { th } = useTheme();
  const [phone, setPhone] = useState(initialPhone);
  const [sex, setSex] = useState<'MALE' | 'FEMALE' | ''>(initialSex);
  // initialLicense vaut toujours '' ici : la carte ne s'affiche que si profileIncomplete,
  // qui exige !membership.membershipNo. Si cet invariant change (édition d'une licence déjà
  // saisie), remplacer par une synchro useEffect ou un remount via key.
  const [license, setLicense] = useState(initialLicense);
  const inputStyle: React.CSSProperties = { width: '100%', boxSizing: 'border-box', background: th.surface2, border: `1px solid ${th.line}`, borderRadius: 11, padding: '11px 13px', fontFamily: th.fontUI, fontSize: 14, color: th.text };
  const primaryBtn: React.CSSProperties = { border: 'none', cursor: 'pointer', background: th.accent, color: th.onAccent, borderRadius: 11, padding: '12px 16px', fontFamily: th.fontUI, fontWeight: 700, fontSize: 14.5, opacity: busy ? 0.6 : 1 };
  return (
    <div style={{ background: th.surface, borderRadius: 16, padding: '16px 18px', boxShadow: `inset 0 0 0 1px ${th.line}`, marginBottom: 16 }}>
      <div style={{ fontFamily: th.fontUI, fontWeight: 700, fontSize: 14.5, color: th.text }}>Complétez votre profil</div>
      <div style={{ fontFamily: th.fontUI, fontSize: 13, color: th.textMute, marginTop: 4, marginBottom: 12 }}>Téléphone, licence et sexe sont requis pour s&apos;inscrire à un tournoi.</div>
      <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Téléphone" style={{ ...inputStyle, marginBottom: 8 }} />
      <input value={license} onChange={(e) => setLicense(e.target.value)} placeholder="N° de licence / adhérent" style={{ ...inputStyle, marginBottom: 8 }} />
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        {(['MALE', 'FEMALE'] as const).map((s) => (
          <button key={s} onClick={() => setSex(s)} style={{ flex: 1, cursor: 'pointer', borderRadius: 11, padding: '10px', fontFamily: th.fontUI, fontSize: 14, border: `1px solid ${sex === s ? th.accent : th.line}`, background: sex === s ? th.surface2 : 'transparent', color: th.text }}>
            {s === 'MALE' ? 'Homme' : 'Femme'}
          </button>
        ))}
      </div>
      <button onClick={() => sex && onSave(phone.trim(), sex, license.trim())} disabled={busy || !phone.trim() || !sex || !license.trim()} style={{ ...primaryBtn, width: '100%' }}>Enregistrer mon profil</button>
    </div>
  );
}
