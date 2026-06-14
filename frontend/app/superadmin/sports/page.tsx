'use client';
import { useState, useEffect, useCallback } from 'react';
import { api, Sport, SportCatalogBody } from '@/lib/api';
import { useAuth } from '@/lib/useAuth';
import { useTheme } from '@/lib/ThemeProvider';
import { durationLabel } from '@/lib/duration';
import { Btn, Field } from '@/components/ui/atoms';

const NOUNS = ['terrain', 'court', 'table', 'piste', 'baie'];
const DURATION_PRESETS = [30, 45, 60, 90, 120];
const STEP_OPTIONS = [15, 30, 60];
const emptyForm = (): SportCatalogBody => ({ name: '', icon: '', resourceNoun: 'terrain', defaultSlotStepMin: 30, defaultDurationsMin: [60, 90], surfaces: [] });

export default function SuperAdminSportsPage() {
  const { th } = useTheme();
  const { token, ready } = useAuth();
  const [sports, setSports]   = useState<Sport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [editId, setEditId]   = useState<string | null>(null); // null = pas de form ; '' = création ; id = édition
  const [form, setForm]       = useState<SportCatalogBody>(emptyForm());
  const [surfaceInput, setSurfaceInput] = useState('');
  const [otherDuration, setOtherDuration] = useState('');
  const [busy, setBusy]       = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { setError(null); setSports(await api.getSports()); }
    catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { if (ready) load(); }, [ready, load]);

  const startCreate = () => { setForm(emptyForm()); setEditId(''); setSurfaceInput(''); setOtherDuration(''); };
  const startEdit = (s: Sport) => {
    setForm({ name: s.name, icon: s.icon ?? '', resourceNoun: s.resourceNoun, defaultSlotStepMin: s.defaultSlotStepMin, defaultDurationsMin: [...s.defaultDurationsMin], surfaces: [...s.surfaces] });
    setEditId(s.id); setSurfaceInput(''); setOtherDuration('');
  };

  const toggleDuration = (m: number) => setForm((f) => ({ ...f, defaultDurationsMin: f.defaultDurationsMin.includes(m) ? f.defaultDurationsMin.filter((x) => x !== m) : [...f.defaultDurationsMin, m].sort((a, b) => a - b) }));
  const addOther = () => { const n = Number(otherDuration); if (Number.isInteger(n) && n > 0 && !form.defaultDurationsMin.includes(n)) setForm((f) => ({ ...f, defaultDurationsMin: [...f.defaultDurationsMin, n].sort((a, b) => a - b) })); setOtherDuration(''); };
  const addSurface = () => { const s = surfaceInput.trim(); if (s && !form.surfaces.includes(s)) setForm((f) => ({ ...f, surfaces: [...f.surfaces, s] })); setSurfaceInput(''); };
  const removeSurface = (s: string) => setForm((f) => ({ ...f, surfaces: f.surfaces.filter((x) => x !== s) }));

  const save = async () => {
    if (!token) return;
    if (!form.name.trim() || form.defaultDurationsMin.length === 0) { setError('Nom requis et au moins une durée.'); return; }
    setBusy(true);
    try {
      setError(null);
      if (editId) await api.platformUpdateSport(editId, form, token);
      else await api.platformCreateSport(form, token);
      setEditId(null); await load();
    } catch (e) {
      const m = (e as Error).message;
      setError(m === 'SPORT_KEY_TAKEN' ? 'Un sport avec ce nom existe déjà.' : m === 'VALIDATION_ERROR' ? 'Champs invalides.' : 'Enregistrement impossible.');
    } finally { setBusy(false); }
  };

  const remove = async (s: Sport) => {
    if (!token || !window.confirm(`Supprimer « ${s.name} » du catalogue ?`)) return;
    setBusy(true);
    try { setError(null); await api.platformDeleteSport(s.id, token); await load(); }
    catch (e) { const m = (e as Error).message; setError(m === 'SPORT_IN_USE' ? `« ${s.name} » est utilisé par au moins un club : suppression impossible.` : 'Suppression impossible.'); }
    finally { setBusy(false); }
  };

  const chip = (on: boolean): React.CSSProperties => ({ border: on ? 'none' : `1px solid ${th.line}`, cursor: 'pointer', borderRadius: 9, padding: '7px 12px', fontFamily: th.fontUI, fontSize: 13, fontWeight: 600, background: on ? th.accent : 'transparent', color: on ? th.onAccent : th.textMute });
  const card: React.CSSProperties = { background: th.surface, borderRadius: 18, padding: 22, boxShadow: `inset 0 0 0 1px ${th.line}`, marginBottom: 16 };
  const sel: React.CSSProperties = { border: `1px solid ${th.line}`, background: th.bg, color: th.text, borderRadius: 9, padding: '9px 11px', fontFamily: th.fontUI, fontSize: 14 };
  const lbl: React.CSSProperties = { fontFamily: th.fontUI, fontSize: 12.5, fontWeight: 600, color: th.textMute, display: 'flex', flexDirection: 'column', gap: 5 };

  return (
    <div style={{ maxWidth: 720 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <h1 style={{ fontFamily: th.fontDisplay, fontWeight: 700, fontSize: 28, color: th.text, margin: 0 }}>Catalogue des sports</h1>
        {editId === null && <Btn onClick={startCreate}>Ajouter un sport</Btn>}
      </div>

      {error && <div style={{ marginBottom: 16, background: th.accent, color: th.onAccent, borderRadius: 12, padding: '11px 14px', fontFamily: th.fontUI, fontSize: 13.5, fontWeight: 600 }}>{error}</div>}

      {editId !== null && (
        <div style={card}>
          <h2 style={{ fontFamily: th.fontDisplay, fontWeight: 600, fontSize: 20, margin: '0 0 16px', color: th.text }}>{editId ? 'Modifier le sport' : 'Nouveau sport'}</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Field label="Nom" value={form.name} onChange={(v) => setForm((f) => ({ ...f, name: v }))} required />
            <Field label="Icône (emoji)" value={form.icon ?? ''} onChange={(v) => setForm((f) => ({ ...f, icon: v }))} placeholder="🎾" />
            <label style={lbl}>Type de ressource
              <select value={form.resourceNoun} onChange={(e) => setForm((f) => ({ ...f, resourceNoun: e.target.value }))} style={sel}>
                {NOUNS.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
            <label style={lbl}>Pas du créneau (min)
              <select value={form.defaultSlotStepMin} onChange={(e) => setForm((f) => ({ ...f, defaultSlotStepMin: Number(e.target.value) }))} style={sel}>
                {STEP_OPTIONS.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>

            <div>
              <span style={{ fontFamily: th.fontUI, fontSize: 12.5, fontWeight: 600, color: th.textMute, display: 'block', marginBottom: 7 }}>Durées proposées</span>
              <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', alignItems: 'center' }}>
                {Array.from(new Set([...DURATION_PRESETS, ...form.defaultDurationsMin])).sort((a, b) => a - b).map((m) => (
                  <button key={m} type="button" onClick={() => toggleDuration(m)} style={chip(form.defaultDurationsMin.includes(m))}>{durationLabel(m)}</button>
                ))}
                <input value={otherDuration} onChange={(e) => setOtherDuration(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addOther(); } }} placeholder="Autre…" inputMode="numeric" style={{ ...sel, width: 90 }} />
                <button type="button" onClick={addOther} style={chip(false)}>+</button>
              </div>
            </div>

            <div>
              <span style={{ fontFamily: th.fontUI, fontSize: 12.5, fontWeight: 600, color: th.textMute, display: 'block', marginBottom: 7 }}>Surfaces (matériaux)</span>
              <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
                {form.surfaces.map((s) => (
                  <span key={s} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, ...chip(true) }}>
                    {s}<button type="button" onClick={() => removeSurface(s)} aria-label={`Retirer ${s}`} style={{ border: 'none', background: 'transparent', color: th.onAccent, cursor: 'pointer', fontSize: 15, lineHeight: 1 }}>×</button>
                  </span>
                ))}
                {form.surfaces.length === 0 && <span style={{ fontFamily: th.fontUI, fontSize: 13, color: th.textFaint }}>Aucun matériau (facultatif).</span>}
              </div>
              <div style={{ display: 'flex', gap: 7 }}>
                <input value={surfaceInput} onChange={(e) => setSurfaceInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addSurface(); } }} placeholder="Ajouter un matériau (ex. Béton poreux)" style={{ ...sel, flex: 1 }} />
                <button type="button" onClick={addSurface} style={chip(false)}>Ajouter</button>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 11, marginTop: 6 }}>
              <Btn variant="surface" onClick={() => setEditId(null)} disabled={busy}>Annuler</Btn>
              <Btn onClick={save} disabled={busy}>{busy ? '…' : 'Enregistrer'}</Btn>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ fontFamily: th.fontUI, color: th.textFaint, padding: '32px 0' }}>Chargement…</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {sports.map((s) => (
            <div key={s.id} style={{ ...card, marginBottom: 0, display: 'flex', alignItems: 'center', gap: 14 }}>
              <span style={{ fontSize: 22 }}>{s.icon ?? '•'}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: th.fontUI, fontWeight: 700, fontSize: 16, color: th.text }}>{s.name} <span style={{ color: th.textFaint, fontWeight: 400 }}>· {s.resourceNoun}</span></div>
                <div style={{ fontFamily: th.fontUI, fontSize: 13, color: th.textMute, marginTop: 3 }}>
                  Durées : {s.defaultDurationsMin.map(durationLabel).join(', ')}
                  {s.surfaces.length > 0 && <> · Surfaces : {s.surfaces.join(', ')}</>}
                </div>
              </div>
              <Btn variant="surface" onClick={() => startEdit(s)}>Modifier</Btn>
              <Btn variant="danger" onClick={() => remove(s)} disabled={busy}>Suppr.</Btn>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
