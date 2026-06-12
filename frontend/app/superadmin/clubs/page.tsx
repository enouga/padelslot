'use client';
import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/lib/useAuth';
import { api, PlatformClub } from '@/lib/api';
import { useTheme } from '@/lib/ThemeProvider';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Btn } from '@/components/ui/atoms';
import { slugify } from '@/lib/slug';

const ROOT = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'localhost';

/** Dialog top-sheet de changement d'alias (même langage visuel que ConfirmDialog). */
function ChangeSlugDialog({ club, onDone, onCancel }: {
  club: PlatformClub;
  onDone: () => void;
  onCancel: () => void;
}) {
  const { th } = useTheme();
  const { token } = useAuth();
  // Suggestion : slug dérivé du nom ACTUEL du club (renommer un club ne touche jamais son slug).
  const [value, setValue] = useState(slugify(club.name));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const next = slugify(value);
  const unchanged = next === club.slug;

  async function submit() {
    if (!token || !next || unchanged) return;
    setBusy(true); setError(null);
    try {
      await api.platformChangeClubSlug(club.id, next, token);
      onDone();
    } catch (err) {
      const m = (err as Error).message;
      setError(m === 'SLUG_TAKEN' ? 'Cet alias est déjà utilisé ou réservé par un autre club.'
        : m === 'SLUG_RESERVED' ? 'Cet alias est réservé par la plateforme (www, app, api…).'
        : m === 'SLUG_INVALID' ? 'Alias invalide : utilisez des lettres, chiffres et tirets.'
        : "Échec du changement d'alias. Réessayez.");
    } finally { setBusy(false); }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 95, display: 'flex', flexDirection: 'column', justifyContent: 'flex-start' }}>
      <div onClick={busy ? undefined : onCancel} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(2px)', animation: 'sp-fade .25s ease' }} />
      <div role="dialog" aria-modal="true" style={{ position: 'relative', width: '100%', maxWidth: 480, margin: '0 auto', background: th.bgElev, borderRadius: '0 0 28px 28px', padding: '12px 20px 36px', boxShadow: '0 10px 40px rgba(0,0,0,0.3)', animation: 'sp-sheet-in-top .34s cubic-bezier(.2,.8,.2,1)' }}>
        <div style={{ fontFamily: th.fontDisplay, fontWeight: 600, fontSize: 26, color: th.text, letterSpacing: -0.3 }}>
          Changer l&apos;alias de {club.name}
        </div>

        <div style={{ fontFamily: th.fontUI, fontSize: 13.5, color: th.textMute, marginTop: 14 }}>
          Adresse actuelle : <span style={{ fontFamily: th.fontMono, color: th.text }}>{club.slug}.{ROOT}</span>
        </div>

        <label style={{ display: 'block', marginTop: 14 }}>
          <span style={{ fontSize: 12.5, color: th.textMute, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4 }}>Nouvel alias</span>
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            autoFocus
            style={{
              display: 'block', width: '100%', marginTop: 6, padding: '11px 14px',
              borderRadius: 12, border: `1px solid ${th.line}`, background: th.surface2,
              color: th.text, fontFamily: th.fontMono, fontSize: 14.5, outline: 'none',
            }}
          />
        </label>

        <div style={{ fontFamily: th.fontUI, fontSize: 13.5, color: th.textMute, marginTop: 10 }}>
          Nouvelle adresse : <span style={{ fontFamily: th.fontMono, color: th.accent }}>{next || '…'}.{ROOT}</span>
        </div>

        <div style={{ fontFamily: th.fontUI, fontSize: 13, color: th.textMute, marginTop: 12, lineHeight: 1.45 }}>
          L&apos;ancienne adresse <span style={{ fontFamily: th.fontMono }}>{club.slug}.{ROOT}</span> restera
          réservée et redirigera définitivement les anciens liens vers la nouvelle adresse.
        </div>

        {error && (
          <div style={{ fontSize: 13.5, color: th.onAccent, background: th.accent, padding: '11px 14px', borderRadius: 12, fontWeight: 600, marginTop: 12 }}>{error}</div>
        )}

        <div style={{ display: 'flex', gap: 11, marginTop: 24 }}>
          <Btn variant="surface" onClick={onCancel} disabled={busy} style={{ flex: '0 0 42%' }}>Retour</Btn>
          <Btn onClick={submit} disabled={busy || !next || unchanged} style={{ flex: 1 }}>
            {busy ? '…' : "Changer l'alias"}
          </Btn>
        </div>
        <div style={{ width: 38, height: 5, borderRadius: 3, background: th.lineStrong, margin: '18px auto 0' }} />
      </div>
    </div>
  );
}

export default function SuperAdminClubs() {
  const { th } = useTheme();
  const { token } = useAuth();
  const [clubs, setClubs] = useState<PlatformClub[]>([]);
  const [pending, setPending] = useState<PlatformClub | null>(null);   // club dont on confirme le changement de statut
  const [slugTarget, setSlugTarget] = useState<PlatformClub | null>(null); // club dont on change l'alias
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!token) return;
    api.platformClubs(token).then(setClubs).catch(() => setClubs([]));
  }, [token]);

  useEffect(load, [load]);

  async function applyStatus() {
    if (!pending || !token) return;
    const next = pending.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    setBusy(true); setError(null);
    try {
      await api.platformSetClubStatus(pending.id, next, token);
      setPending(null);
      load();
    } catch {
      setError('Échec de la mise à jour du statut. Réessayez.');
    } finally {
      setBusy(false);
    }
  }

  const cell: React.CSSProperties = { padding: '12px 14px', borderBottom: `1px solid ${th.line}`, fontSize: 14, color: th.text };
  const head: React.CSSProperties = { ...cell, color: th.textMute, fontWeight: 700, fontSize: 12.5, textTransform: 'uppercase', letterSpacing: 0.4 };
  const actionBtn: React.CSSProperties = {
    border: `1px solid ${th.line}`, background: 'transparent', color: th.text,
    borderRadius: 9, padding: '6px 12px', cursor: 'pointer', fontSize: 13, fontWeight: 600,
  };

  return (
    <div>
      <h1 style={{ fontFamily: th.fontDisplay, fontSize: 28, fontWeight: 700, color: th.text, marginBottom: 20 }}>Clubs</h1>
      {error && (
        <div style={{ fontSize: 13.5, color: th.onAccent, background: th.accent, padding: '11px 14px', borderRadius: 12, fontWeight: 600, marginBottom: 16 }}>{error}</div>
      )}
      <div style={{ background: th.bgElev, border: `1px solid ${th.line}`, borderRadius: 14, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>
            <th style={{ ...head, textAlign: 'left' }}>Club</th>
            <th style={{ ...head, textAlign: 'left' }}>Gérant</th>
            <th style={{ ...head, textAlign: 'right' }}>Adhérents</th>
            <th style={{ ...head, textAlign: 'right' }}>Ressources</th>
            <th style={{ ...head, textAlign: 'left' }}>Statut</th>
            <th style={{ ...head, textAlign: 'right' }}>Actions</th>
          </tr></thead>
          <tbody>
            {clubs.map((c) => (
              <tr key={c.id}>
                <td style={cell}>
                  <strong>{c.name}</strong><br />
                  <span style={{ color: th.textFaint, fontSize: 12.5 }}>{c.slug}{c.city ? ` · ${c.city}` : ''}</span>
                  {c.aliases.length > 0 && (
                    <><br /><span style={{ color: th.textFaint, fontSize: 12 }}>Alias : {c.aliases.join(', ')}</span></>
                  )}
                </td>
                <td style={cell}>{c.owners[0]?.email ?? <span style={{ color: th.textFaint }}>—</span>}</td>
                <td style={{ ...cell, textAlign: 'right', fontFamily: th.fontMono }}>{c.counts.adherents}</td>
                <td style={{ ...cell, textAlign: 'right', fontFamily: th.fontMono }}>{c.counts.resources}</td>
                <td style={cell}>
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: c.status === 'ACTIVE' ? th.accent : th.textFaint }}>
                    {c.status === 'ACTIVE' ? 'Actif' : 'Suspendu'}
                  </span>
                </td>
                <td style={{ ...cell, textAlign: 'right', whiteSpace: 'nowrap' }}>
                  <button onClick={() => setSlugTarget(c)} style={{ ...actionBtn, marginRight: 8 }}>
                    Changer l&apos;alias
                  </button>
                  <button onClick={() => setPending(c)} style={actionBtn}>
                    {c.status === 'ACTIVE' ? 'Suspendre' : 'Réactiver'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pending && (
        <ConfirmDialog
          title={pending.status === 'ACTIVE' ? `Suspendre ${pending.name} ?` : `Réactiver ${pending.name} ?`}
          message={pending.status === 'ACTIVE'
            ? "Le club disparaîtra de l'annuaire public et sa page ne sera plus accessible."
            : "Le club redeviendra visible dans l'annuaire et sa page sera de nouveau accessible."}
          confirmLabel={pending.status === 'ACTIVE' ? 'Suspendre' : 'Réactiver'}
          busy={busy}
          onConfirm={applyStatus}
          onCancel={() => setPending(null)}
        />
      )}

      {slugTarget && (
        <ChangeSlugDialog
          club={slugTarget}
          onDone={() => { setSlugTarget(null); load(); }}
          onCancel={() => setSlugTarget(null)}
        />
      )}
    </div>
  );
}
