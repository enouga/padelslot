'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useTheme } from '@/lib/ThemeProvider';

// Annuaire du club : recherche d'un coéquipier par nom (membres actifs uniquement).
export function PartnerSearch({ slug, token, selected, onSelect, onClear, disabled }: {
  slug: string;
  token: string;
  selected: { id: string; firstName: string; lastName: string } | null;
  onSelect: (m: { id: string; firstName: string; lastName: string }) => void;
  onClear: () => void;
  disabled?: boolean;
}) {
  const { th } = useTheme();
  const [q, setQ] = useState('');
  const [results, setResults] = useState<{ id: string; firstName: string; lastName: string }[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (selected || !open) return;
    const query = q.trim();
    const handle = setTimeout(() => {
      api.searchClubMembers(slug, query, token)
        .then(setResults)
        .catch(() => setResults([]));
    }, query ? 250 : 0);
    return () => clearTimeout(handle);
  }, [q, slug, token, selected, open]);

  const inputStyle: React.CSSProperties = { width: '100%', boxSizing: 'border-box', background: th.surface2, border: `1px solid ${th.line}`, borderRadius: 11, padding: '11px 13px', fontFamily: th.fontUI, fontSize: 14, color: th.text };

  if (selected) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ ...inputStyle, flex: 1, display: 'flex', alignItems: 'center' }}>{selected.firstName} {selected.lastName}</div>
        <button onClick={onClear} disabled={disabled} style={{ border: `1px solid ${th.line}`, background: 'transparent', color: th.textMute, cursor: 'pointer', borderRadius: 11, padding: '10px 14px', fontFamily: th.fontUI, fontSize: 13.5, whiteSpace: 'nowrap' }}>Changer</button>
      </div>
    );
  }

  return (
    <div style={{ position: 'relative' }}>
      <input value={q} onChange={(e) => setQ(e.target.value)}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Cliquez pour voir les membres, ou tapez un nom…" disabled={disabled} style={inputStyle} />
      {open && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 30, marginTop: 4, maxHeight: 260, overflowY: 'auto', background: th.surface, borderRadius: 11, boxShadow: `0 8px 24px rgba(0,0,0,0.25), inset 0 0 0 1px ${th.line}` }}>
          {results.length === 0
            ? <div style={{ padding: '10px 13px', fontFamily: th.fontUI, fontSize: 13.5, color: th.textMute }}>Aucun membre trouvé.</div>
            : results.map((m) => (
                <button key={m.id} onMouseDown={(e) => { e.preventDefault(); onSelect(m); setOpen(false); setQ(''); }} style={{ display: 'block', width: '100%', textAlign: 'left', border: 'none', background: 'transparent', cursor: 'pointer', padding: '10px 13px', fontFamily: th.fontUI, fontSize: 14, color: th.text }}>
                  {m.firstName} {m.lastName}
                </button>
              ))}
        </div>
      )}
    </div>
  );
}
