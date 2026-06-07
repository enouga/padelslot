'use client';
import { useState, useEffect, useCallback } from 'react';
import { api, ClubSummary, Sport } from '@/lib/api';
import { useTheme } from '@/lib/ThemeProvider';
import { ClubCard } from '@/components/ClubCard';

// Moteur de recherche d'annuaire (nom / ville / sport) + grille de résultats.
// Bloc embeddable : ne rend QUE la recherche + les résultats (pas de Screen ni de titre de page),
// pour être réutilisé sur /clubs comme sur l'accueil plateforme.
export function ClubDirectory() {
  const { th } = useTheme();
  const [sports, setSports] = useState<Sport[]>([]);
  const [clubs, setClubs]   = useState<ClubSummary[]>([]);
  const [q, setQ]           = useState('');
  const [city, setCity]     = useState('');
  const [sport, setSport]   = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => { api.getSports().then(setSports).catch(() => setSports([])); }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try { setClubs(await api.listClubs({ q: q || undefined, city: city || undefined, sport: sport || undefined })); }
    catch { setClubs([]); }
    finally { setLoading(false); }
  }, [q, city, sport]);

  useEffect(() => { const t = setTimeout(load, 200); return () => clearTimeout(t); }, [load]);

  const inputStyle = { flex: 1, minWidth: 0, height: 46, padding: '0 14px', borderRadius: 12, background: th.surface, color: th.text, border: 'none', boxShadow: `inset 0 0 0 1.5px ${th.line}`, fontFamily: th.fontUI, fontSize: 15 } as const;

  return (
    <>
      {/* recherche */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '18px 20px 0' }}>
        <div style={{ display: 'flex', gap: 10 }}>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nom du club" style={inputStyle} />
          <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Ville" style={inputStyle} />
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <button onClick={() => setSport('')} style={chipBtn(th, sport === '')}>Tous</button>
          {sports.map((s) => (
            <button key={s.key} onClick={() => setSport(sport === s.key ? '' : s.key)} style={chipBtn(th, sport === s.key)}>
              {s.icon ? `${s.icon} ` : ''}{s.name}
            </button>
          ))}
        </div>
      </div>

      {/* résultats */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '20px 20px 0' }}>
        {loading ? (
          <div style={{ padding: '30px 0', textAlign: 'center', fontFamily: th.fontUI, color: th.textFaint }}>Chargement…</div>
        ) : clubs.length === 0 ? (
          <div style={{ padding: '30px 0', textAlign: 'center', fontFamily: th.fontUI, color: th.textMute }}>Aucun club ne correspond.</div>
        ) : (
          clubs.map((c) => <ClubCard key={c.id} club={c} />)
        )}
      </div>
    </>
  );
}

function chipBtn(th: ReturnType<typeof useTheme>['th'], active: boolean): React.CSSProperties {
  return {
    flexShrink: 0, border: 'none', cursor: 'pointer', borderRadius: 10, padding: '8px 14px',
    fontFamily: th.fontUI, fontSize: 13.5, fontWeight: 600, whiteSpace: 'nowrap',
    background: active ? th.ink : th.surface2,
    color: active ? (th.mode === 'floodlit' ? th.text : '#f7f5ee') : th.textMute,
  };
}
