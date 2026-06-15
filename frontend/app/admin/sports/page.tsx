'use client';
import { useState, useEffect, useCallback } from 'react';
import { api, AdminClubSport, Sport } from '@/lib/api';
import { useAuth } from '@/lib/useAuth';
import { useClub } from '@/lib/ClubProvider';
import { useTheme } from '@/lib/ThemeProvider';
import { durationLabel, effectiveDurations, proposableDurations } from '@/lib/duration';

export default function AdminSportsPage() {
  const { th } = useTheme();
  const { token, ready } = useAuth();
  const { club } = useClub();
  const clubId = club?.id;
  const [enabled, setEnabled]   = useState<AdminClubSport[]>([]);
  const [catalog, setCatalog]   = useState<Sport[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [adding, setAdding]     = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token || !clubId) return;
    setLoading(true);
    try {
      setError(null);
      const [en, cat] = await Promise.all([api.adminGetSports(clubId, token), api.getSports()]);
      setEnabled(en);
      setCatalog(cat);
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }, [token, clubId]);

  useEffect(() => { if (ready && token && clubId) load(); }, [ready, token, clubId, load]);

  const add = async (sportId: string) => {
    if (!token || !clubId) return;
    setAdding(sportId);
    try { setError(null); await api.adminAddSport(clubId, sportId, token); await load(); }
    catch (e) { setError((e as Error).message); }
    finally { setAdding(null); }
  };

  const enabledIds = new Set(enabled.map((e) => e.sport.id));
  const available = catalog.filter((s) => !enabledIds.has(s.id));

  const toggleDuration = async (cs: AdminClubSport, min: number) => {
    if (!token || !clubId) return;
    const cur = new Set(effectiveDurations(cs.durationsMin, cs.sport.defaultDurationsMin));
    if (cur.has(min)) cur.delete(min); else cur.add(min);
    if (cur.size === 0) return; // au moins une durée
    try { setError(null); await api.adminUpdateClubSport(clubId, cs.id, Array.from(cur).sort((a, b) => a - b), token); await load(); }
    catch (e) { setError((e as Error).message); }
  };

  return (
    <div style={{ maxWidth: 640 }}>
      <h1 style={{ fontFamily: th.fontDisplay, fontWeight: 600, fontSize: 34, letterSpacing: -0.5, margin: '0 0 24px', color: th.text }}>Sports</h1>

      {error && <div style={{ marginBottom: 16, background: th.accent, color: th.onAccent, borderRadius: 12, padding: '11px 14px', fontFamily: th.fontUI, fontSize: 13.5, fontWeight: 600 }}>{error}</div>}

      {loading ? (
        <div style={{ fontFamily: th.fontUI, color: th.textFaint, padding: '32px 0' }}>Chargement…</div>
      ) : (
        <>
          <div style={{ background: th.surface, borderRadius: 18, padding: 22, boxShadow: `inset 0 0 0 1px ${th.line}`, marginBottom: 16 }}>
            <h2 style={{ fontFamily: th.fontDisplay, fontWeight: 600, fontSize: 20, margin: '0 0 14px', color: th.text }}>Proposés par le club</h2>
            {enabled.length === 0 ? (
              <p style={{ fontFamily: th.fontUI, fontSize: 14, color: th.textMute, margin: 0 }}>Aucun sport activé pour l'instant.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {enabled.map((e) => {
                  const eff = effectiveDurations(e.durationsMin, e.sport.defaultDurationsMin);
                  return (
                    <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                      <span style={{ fontFamily: th.fontUI, fontSize: 15, fontWeight: 700, color: th.text, minWidth: 110 }}>{e.sport.name}</span>
                      <span style={{ fontFamily: th.fontUI, fontSize: 12.5, color: th.textMute }}>Durées proposées :</span>
                      <div style={{ display: 'flex', gap: 7 }}>
                        {proposableDurations(e.sport.defaultDurationsMin).map((m) => {
                          const on = eff.includes(m);
                          return (
                            <button key={m} onClick={() => toggleDuration(e, m)}
                              style={{ border: on ? 'none' : `1px solid ${th.line}`, cursor: 'pointer', borderRadius: 9, padding: '7px 12px', fontFamily: th.fontUI, fontSize: 13, fontWeight: 600, background: on ? th.accent : 'transparent', color: on ? th.onAccent : th.textMute }}>
                              {durationLabel(m)}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div style={{ background: th.surface, borderRadius: 18, padding: 22, boxShadow: `inset 0 0 0 1px ${th.line}` }}>
            <h2 style={{ fontFamily: th.fontDisplay, fontWeight: 600, fontSize: 20, margin: '0 0 6px', color: th.text }}>Ajouter un sport</h2>
            <p style={{ fontFamily: th.fontUI, fontSize: 13.5, color: th.textMute, margin: '0 0 14px' }}>Depuis le catalogue de la plateforme.</p>
            {available.length === 0 ? (
              <p style={{ fontFamily: th.fontUI, fontSize: 14, color: th.textMute, margin: 0 }}>Tous les sports du catalogue sont déjà activés.</p>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                {available.map((s) => (
                  <button key={s.id} onClick={() => add(s.id)} disabled={adding === s.id}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 8, border: `1px dashed ${th.lineStrong}`, background: 'transparent', cursor: 'pointer', borderRadius: 12, padding: '9px 14px', fontFamily: th.fontUI, fontSize: 14, fontWeight: 600, color: th.text, opacity: adding === s.id ? 0.5 : 1 }}>
                    {s.icon ? `${s.icon} ` : ''}{s.name}
                    <span style={{ color: th.accent, fontWeight: 700 }}>+</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
