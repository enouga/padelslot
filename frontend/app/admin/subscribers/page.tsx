'use client';
import { useState, useEffect, useCallback, CSSProperties } from 'react';
import { api, Subscriber } from '@/lib/api';
import { useAuth } from '@/lib/useAuth';
import { useClub } from '@/lib/ClubProvider';
import { useTheme } from '@/lib/ThemeProvider';
import { Btn } from '@/components/ui/atoms';

export default function AdminSubscribersPage() {
  const { th } = useTheme();
  const { token, ready } = useAuth();
  const { club } = useClub();
  const clubId = club?.id;
  const [subs, setSubs]       = useState<Subscriber[]>([]);
  const [email, setEmail]     = useState('');
  const [loading, setLoading] = useState(true);
  const [adding, setAdding]   = useState(false);
  const [error, setError]     = useState<string | null>(null);

  const cell: CSSProperties = { padding: '12px 16px', fontFamily: th.fontUI, fontSize: 14, color: th.text };

  const load = useCallback(async () => {
    if (!token || !clubId) return;
    setLoading(true);
    try { setError(null); setSubs(await api.adminGetSubscribers(clubId, token)); }
    catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }, [token, clubId]);

  useEffect(() => { if (ready && token && clubId) load(); }, [ready, token, clubId, load]);

  const add = async () => {
    if (!token || !clubId || !email.trim()) return;
    setAdding(true);
    try {
      setError(null);
      await api.adminAddSubscriber(clubId, email.trim(), token);
      setEmail('');
      await load();
    } catch (e) {
      setError((e as Error).message === 'USER_NOT_FOUND' ? "Aucun compte joueur avec cet email (il doit d'abord créer un compte)." : (e as Error).message);
    } finally { setAdding(false); }
  };

  const remove = async (s: Subscriber) => {
    if (!token || !clubId) return;
    try { setError(null); await api.adminRemoveSubscriber(clubId, s.id, token); await load(); }
    catch (e) { setError((e as Error).message); }
  };

  return (
    <div style={{ maxWidth: 720 }}>
      <h1 style={{ fontFamily: th.fontDisplay, fontWeight: 600, fontSize: 34, letterSpacing: -0.5, margin: '0 0 8px', color: th.text }}>Abonnés</h1>
      <p style={{ fontFamily: th.fontUI, fontSize: 14, color: th.textMute, margin: '0 0 22px' }}>Les abonnés du club réservent plus tôt (fenêtre élargie, voir Réglages).</p>

      {error && <div style={{ marginBottom: 16, background: th.accent, color: th.onAccent, borderRadius: 12, padding: '11px 14px', fontFamily: th.fontUI, fontSize: 13.5, fontWeight: 600 }}>{error}</div>}

      <div style={{ background: th.surface, borderRadius: 18, padding: 18, boxShadow: `inset 0 0 0 1px ${th.line}`, marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <label style={{ flex: 1, minWidth: 220, fontFamily: th.fontUI, fontSize: 12.5, fontWeight: 600, color: th.textMute, display: 'flex', flexDirection: 'column', gap: 6 }}>
            Ajouter un abonné (email du joueur)
            <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="joueur@exemple.fr" type="email"
              style={{ height: 46, padding: '0 14px', borderRadius: 12, background: th.bg, color: th.text, border: `1px solid ${th.line}`, fontFamily: th.fontUI, fontSize: 15 }} />
          </label>
          <Btn onClick={add} icon="plus" disabled={adding || !email.trim()}>{adding ? '…' : 'Ajouter'}</Btn>
        </div>
      </div>

      {loading ? (
        <div style={{ padding: '32px 0', fontFamily: th.fontUI, color: th.textFaint }}>Chargement…</div>
      ) : (
        <div style={{ overflowX: 'auto', borderRadius: 18, background: th.surface, boxShadow: `inset 0 0 0 1px ${th.line}` }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${th.line}`, textAlign: 'left' }}>
                {['Joueur', 'Email', ''].map((h, i) => (
                  <th key={i} style={{ padding: '12px 16px', fontFamily: th.fontUI, fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.3, color: th.textMute }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {subs.length === 0 && <tr><td colSpan={3} style={{ ...cell, textAlign: 'center', color: th.textFaint, padding: '28px 16px' }}>Aucun abonné pour l'instant.</td></tr>}
              {subs.map((s) => (
                <tr key={s.id} style={{ borderBottom: `1px solid ${th.line}` }}>
                  <td style={{ ...cell, fontWeight: 600 }}>{s.firstName} {s.lastName}</td>
                  <td style={{ ...cell, color: th.textMute }}>{s.email}</td>
                  <td style={cell}>
                    <button onClick={() => remove(s)} style={{ border: `1px solid ${th.line}`, background: 'transparent', cursor: 'pointer', borderRadius: 9, padding: '6px 12px', fontFamily: th.fontUI, fontSize: 12.5, fontWeight: 600, color: '#ff7a4d' }}>Retirer</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
