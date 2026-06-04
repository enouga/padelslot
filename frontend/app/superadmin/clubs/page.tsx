'use client';
import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/lib/useAuth';
import { api, PlatformClub } from '@/lib/api';
import { useTheme } from '@/lib/ThemeProvider';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

export default function SuperAdminClubs() {
  const { th } = useTheme();
  const { token } = useAuth();
  const [clubs, setClubs] = useState<PlatformClub[]>([]);
  const [pending, setPending] = useState<PlatformClub | null>(null); // club dont on confirme le changement

  const load = useCallback(() => {
    if (!token) return;
    api.platformClubs(token).then(setClubs).catch(() => setClubs([]));
  }, [token]);

  useEffect(load, [load]);

  async function applyStatus() {
    if (!pending || !token) return;
    const next = pending.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    await api.platformSetClubStatus(pending.id, next, token).catch(() => {});
    setPending(null);
    load();
  }

  const cell: React.CSSProperties = { padding: '12px 14px', borderBottom: `1px solid ${th.line}`, fontSize: 14, color: th.text };
  const head: React.CSSProperties = { ...cell, color: th.textMute, fontWeight: 700, fontSize: 12.5, textTransform: 'uppercase', letterSpacing: 0.4 };

  return (
    <div>
      <h1 style={{ fontFamily: th.fontUI, fontSize: 28, fontWeight: 700, color: th.text, marginBottom: 20 }}>Clubs</h1>
      <div style={{ background: th.bgElev, border: `1px solid ${th.line}`, borderRadius: 14, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>
            <th style={{ ...head, textAlign: 'left' }}>Club</th>
            <th style={{ ...head, textAlign: 'left' }}>Gérant</th>
            <th style={{ ...head, textAlign: 'right' }}>Adhérents</th>
            <th style={{ ...head, textAlign: 'right' }}>Ressources</th>
            <th style={{ ...head, textAlign: 'left' }}>Statut</th>
            <th style={{ ...head, textAlign: 'right' }}>Action</th>
          </tr></thead>
          <tbody>
            {clubs.map((c) => (
              <tr key={c.id}>
                <td style={cell}><strong>{c.name}</strong><br /><span style={{ color: th.textFaint, fontSize: 12.5 }}>{c.slug}{c.city ? ` · ${c.city}` : ''}</span></td>
                <td style={cell}>{c.owners[0]?.email ?? <span style={{ color: th.textFaint }}>—</span>}</td>
                <td style={{ ...cell, textAlign: 'right', fontFamily: th.fontMono }}>{c.counts.adherents}</td>
                <td style={{ ...cell, textAlign: 'right', fontFamily: th.fontMono }}>{c.counts.resources}</td>
                <td style={cell}>
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: c.status === 'ACTIVE' ? th.accent : th.textFaint }}>
                    {c.status === 'ACTIVE' ? 'Actif' : 'Suspendu'}
                  </span>
                </td>
                <td style={{ ...cell, textAlign: 'right' }}>
                  <button onClick={() => setPending(c)} style={{
                    border: `1px solid ${th.line}`, background: 'transparent', color: th.text,
                    borderRadius: 9, padding: '6px 12px', cursor: 'pointer', fontSize: 13, fontWeight: 600,
                  }}>
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
            ? 'Le club disparaîtra de l’annuaire public et sa page ne sera plus accessible.'
            : 'Le club redeviendra visible dans l’annuaire et sa page sera de nouveau accessible.'}
          confirmLabel={pending.status === 'ACTIVE' ? 'Suspendre' : 'Réactiver'}
          onConfirm={applyStatus}
          onCancel={() => setPending(null)}
        />
      )}
    </div>
  );
}
