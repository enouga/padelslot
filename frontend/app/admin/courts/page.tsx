'use client';
import { useState, useEffect, useCallback, CSSProperties } from 'react';
import { api, AdminResource, AdminClubSport } from '@/lib/api';
import { useAuth } from '@/lib/useAuth';
import { useClub } from '@/lib/ClubProvider';
import { useTheme } from '@/lib/ThemeProvider';
import { COURT_FORMATS } from '@/lib/courtType';
import { Btn } from '@/components/ui/atoms';
import { Icon } from '@/components/ui/Icon';

const STEP_OPTIONS = [15, 30, 45, 60, 90, 120];

export default function AdminResourcesPage() {
  const { th } = useTheme();
  const { token, ready } = useAuth();
  const { club } = useClub();
  const clubId = club?.id;
  const [resources, setResources] = useState<AdminResource[]>([]);
  const [sports, setSports]       = useState<AdminClubSport[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);

  const [nr, setNr] = useState({ name: '', clubSportId: '', surface: '', covered: false, format: 'double', price: '25', offPeakPrice: '', openHour: '8', closeHour: '22', slotStepMin: '' });
  const [creating, setCreating] = useState(false);
  const [dragId, setDragId]     = useState<string | null>(null);
  const [dirty, setDirty]       = useState<Set<string>>(new Set());
  const [saving, setSaving]     = useState(false);

  const cell: CSSProperties = { padding: '14px 18px', fontFamily: th.fontUI, fontSize: 14, color: th.text };
  const input: CSSProperties = { border: `1px solid ${th.line}`, background: th.bg, color: th.text, borderRadius: 8, padding: '6px 8px', fontFamily: th.fontUI, fontSize: 14 };
  const label: CSSProperties = { fontFamily: th.fontUI, fontSize: 12.5, fontWeight: 600, color: th.textMute, display: 'flex', flexDirection: 'column', gap: 5 };

  const load = useCallback(async () => {
    if (!token || !clubId) return;
    setLoading(true);
    try {
      setError(null);
      const [res, sp] = await Promise.all([api.adminGetResources(clubId, token), api.adminGetSports(clubId, token)]);
      setResources(res);
      setSports(sp);
      setNr((n) => (n.clubSportId || sp.length === 0 ? n : { ...n, clubSportId: sp[0].id }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [token, clubId]);

  useEffect(() => { if (ready && token && clubId) load(); }, [ready, token, clubId, load]);

  const markDirty = (id: string) => setDirty((prev) => (prev.has(id) ? prev : new Set(prev).add(id)));

  const editField = (id: string, field: 'name' | 'price' | 'offPeakPrice' | 'openHour' | 'closeHour', value: string) => {
    setResources((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
    markDirty(id);
  };

  // Édite un sous-champ d'attributes (surface/format) en préservant les autres clés (dont sortOrder).
  const editAttr = (id: string, key: 'surface' | 'format', value: string) => {
    setResources((prev) => prev.map((r) => (r.id === id ? { ...r, attributes: { ...r.attributes, [key]: value } } : r)));
    markDirty(id);
  };

  const editCovered = (id: string, covered: boolean) => {
    setResources((prev) => prev.map((r) => (r.id === id ? { ...r, attributes: { ...r.attributes, covered } } : r)));
    markDirty(id);
  };

  const surfacesFor = (clubSportId: string) => sports.find((s) => s.id === clubSportId)?.sport.surfaces ?? [];

  const editStep = (id: string, value: string) => {
    setResources((prev) => prev.map((r) => (r.id === id ? { ...r, slotStepMin: value === '' ? null : Number(value) } : r)));
    markDirty(id);
  };

  const defaultStep = (r: AdminResource) => r.clubSport.slotStepMin ?? r.clubSport.sport.defaultSlotStepMin;

  // Enregistre en une seule fois toutes les lignes modifiées.
  const saveAll = async () => {
    if (!token || !clubId || dirty.size === 0) return;
    const toSave = resources.filter((r) => dirty.has(r.id));
    if (toSave.some((r) => !r.name.trim())) { setError('Le nom d\'un terrain ne peut pas être vide.'); return; }
    setSaving(true);
    setError(null);
    const results = await Promise.allSettled(toSave.map((r) =>
      api.adminUpdateResource(clubId, r.id, {
        name: r.name.trim(),
        attributes: r.attributes,
        price: Number(r.price),
        offPeakPrice: r.offPeakPrice === null || r.offPeakPrice === '' ? null : Number(r.offPeakPrice),
        openHour: Number(r.openHour), closeHour: Number(r.closeHour), slotStepMin: r.slotStepMin,
      }, token),
    ));
    const failed = results.map((res, i) => ({ res, r: toSave[i] })).filter((x) => x.res.status === 'rejected');
    await load();
    setDirty(new Set());
    if (failed.length) {
      const reason = (failed[0].res as PromiseRejectedResult).reason as Error;
      setError(`Échec pour : ${failed.map((f) => f.r.name).join(', ')} (${reason.message})`);
    }
    setSaving(false);
  };

  const onDropRow = (targetId: string) => {
    if (!dragId || dragId === targetId) { setDragId(null); return; }
    const arr = [...resources];
    const from = arr.findIndex((r) => r.id === dragId);
    const to = arr.findIndex((r) => r.id === targetId);
    setDragId(null);
    if (from < 0 || to < 0) return;
    const [moved] = arr.splice(from, 1);
    arr.splice(to, 0, moved);
    setResources(arr); // optimiste
    if (token && clubId) api.adminReorderResources(clubId, arr.map((r) => r.id), token).catch((e) => setError((e as Error).message));
  };

  const toggleActive = async (r: AdminResource) => {
    if (!token || !clubId) return;
    // Optimiste, sans recharger toute la table : préserve les autres lignes en cours d'édition.
    setResources((prev) => prev.map((x) => (x.id === r.id ? { ...x, isActive: !x.isActive } : x)));
    try { setError(null); await api.adminSetResourceActive(clubId, r.id, !r.isActive, token); }
    catch (e) {
      setResources((prev) => prev.map((x) => (x.id === r.id ? { ...x, isActive: r.isActive } : x)));
      setError((e as Error).message);
    }
  };

  const create = async () => {
    if (!token || !clubId || !nr.clubSportId) return;
    setCreating(true);
    try {
      setError(null);
      await api.adminCreateResource(clubId, {
        clubSportId: nr.clubSportId, name: nr.name, attributes: { surface: nr.surface || undefined, covered: nr.covered, format: nr.format },
        price: Number(nr.price),
        offPeakPrice: nr.offPeakPrice ? Number(nr.offPeakPrice) : null,
        openHour: Number(nr.openHour), closeHour: Number(nr.closeHour),
        slotStepMin: nr.slotStepMin ? Number(nr.slotStepMin) : undefined,
      }, token);
      setNr((n) => ({ ...n, name: '', surface: '', covered: false, price: '25', offPeakPrice: '', openHour: '8', closeHour: '22', slotStepMin: '' }));
      await load();
    } catch (e) {
      const msg = (e as Error).message === 'VALIDATION_ERROR' ? 'champs invalides (tarif > 0, ouverture < fermeture, créneau multiple de 15)' : (e as Error).message;
      setError(`Création : ${msg}`);
    } finally { setCreating(false); }
  };

  return (
    <div>
      <h1 style={{ fontFamily: th.fontDisplay, fontWeight: 600, fontSize: 34, letterSpacing: -0.5, margin: '0 0 24px', color: th.text }}>Ressources</h1>

      {error && <div style={{ marginBottom: 16, background: th.accent, color: th.onAccent, borderRadius: 12, padding: '11px 14px', fontFamily: th.fontUI, fontSize: 13.5, fontWeight: 600 }}>{error}</div>}

      {loading ? (
        <div style={{ padding: '32px 0', fontFamily: th.fontUI, color: th.textFaint }}>Chargement…</div>
      ) : (
        <>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 14 }}>
          <span style={{ fontFamily: th.fontUI, fontSize: 13.5, color: dirty.size > 0 ? th.text : th.textFaint }}>
            {dirty.size > 0 ? `${dirty.size} ligne${dirty.size > 1 ? 's' : ''} modifiée${dirty.size > 1 ? 's' : ''} non enregistrée${dirty.size > 1 ? 's' : ''}` : 'Aucune modification en attente'}
          </span>
          <Btn onClick={saveAll} disabled={saving || dirty.size === 0} icon="check">{saving ? 'Enregistrement…' : 'Enregistrer les modifications'}</Btn>
        </div>
        <div style={{ marginBottom: 28, overflowX: 'auto', borderRadius: 18, background: th.surface, boxShadow: `inset 0 0 0 1px ${th.line}` }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${th.line}`, textAlign: 'left' }}>
                {['', 'Ressource', 'Sport', 'Surface', 'Format', '€ créneau plein', '€ créneau creux', 'Ouv.', 'Ferm.', 'Créneau', 'Statut'].map((h, i) => (
                  <th key={i} style={{ padding: '14px 18px', fontFamily: th.fontUI, fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.3, color: th.textMute, whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {resources.map((r) => (
                <tr key={r.id}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => onDropRow(r.id)}
                  style={{ borderBottom: `1px solid ${th.line}`, opacity: dragId === r.id ? 0.4 : (r.isActive ? 1 : 0.5), background: dragId === r.id ? th.surface2 : 'transparent' }}>
                  <td style={{ ...cell, width: 30, paddingRight: 0, cursor: 'grab' }}
                    draggable
                    onDragStart={() => setDragId(r.id)}
                    onDragEnd={() => setDragId(null)}
                    title="Glisser pour réordonner">
                    <Icon name="grip" size={18} color={th.textFaint} />
                  </td>
                  <td style={cell}>
                    <input value={r.name} onChange={(e) => editField(r.id, 'name', e.target.value)} placeholder="Nom du terrain" style={{ ...input, width: 200, fontWeight: 600 }} />
                  </td>
                  <td style={{ ...cell, color: th.textMute }}>{r.clubSport.sport.name}</td>
                  <td style={cell}>
                    {(r.clubSport.sport.surfaces ?? []).length > 0 && (
                      <select value={typeof r.attributes?.surface === 'string' ? r.attributes.surface : ''} onChange={(e) => editAttr(r.id, 'surface', e.target.value)} style={{ ...input, width: 110 }}>
                        <option value="">—</option>
                        {(r.clubSport.sport.surfaces ?? []).map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    )}
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginLeft: 8, fontSize: 13 }}>
                      <input type="checkbox" checked={r.attributes?.covered === true} onChange={(e) => editCovered(r.id, e.target.checked)} /> Couvert
                    </label>
                  </td>
                  <td style={cell}>
                    <select value={typeof r.attributes?.format === 'string' ? r.attributes.format : 'double'} onChange={(e) => editAttr(r.id, 'format', e.target.value)} style={{ ...input, width: 100 }}>
                      {COURT_FORMATS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  </td>
                  <td style={cell}><input type="number" min={1} step="0.5" value={r.price} onChange={(e) => editField(r.id, 'price', e.target.value)} style={{ ...input, width: 90 }} /></td>
                  <td style={cell}><input type="number" min={1} step="0.5" placeholder="—" value={r.offPeakPrice ?? ''} onChange={(e) => editField(r.id, 'offPeakPrice', e.target.value)} style={{ ...input, width: 90 }} /></td>
                  <td style={cell}><input type="number" min={0} max={24} value={r.openHour} onChange={(e) => editField(r.id, 'openHour', e.target.value)} style={{ ...input, width: 60 }} /></td>
                  <td style={cell}><input type="number" min={0} max={24} value={r.closeHour} onChange={(e) => editField(r.id, 'closeHour', e.target.value)} style={{ ...input, width: 60 }} /></td>
                  <td style={cell}>
                    <select value={r.slotStepMin ?? ''} onChange={(e) => editStep(r.id, e.target.value)} style={{ ...input, width: 110 }}>
                      <option value="">Défaut ({defaultStep(r)} min)</option>
                      {STEP_OPTIONS.map((s) => <option key={s} value={s}>{s} min</option>)}
                    </select>
                  </td>
                  <td style={cell}>
                    <button onClick={() => toggleActive(r)} style={{
                      border: 'none', cursor: 'pointer', borderRadius: 999, padding: '5px 12px', fontFamily: th.fontUI, fontSize: 12, fontWeight: 600,
                      background: r.isActive ? `${th.accent}22` : th.surface2, color: r.isActive ? (th.mode === 'floodlit' ? th.accent : th.ink) : th.textMute,
                    }}>{r.isActive ? 'Actif' : 'Inactif'}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
      )}

      <div style={{ background: th.surface, borderRadius: 18, padding: 22, boxShadow: `inset 0 0 0 1px ${th.line}` }}>
        <h2 style={{ fontFamily: th.fontDisplay, fontWeight: 600, fontSize: 20, margin: '0 0 16px', color: th.text }}>Ajouter une ressource</h2>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: 14 }}>
          <label style={label}>Sport
            <select value={nr.clubSportId} onChange={(e) => setNr({ ...nr, clubSportId: e.target.value, surface: '' })} style={input}>
              {sports.map((s) => <option key={s.id} value={s.id}>{s.sport.name}</option>)}
            </select>
          </label>
          <label style={label}>Nom
            <input value={nr.name} onChange={(e) => setNr({ ...nr, name: e.target.value })} placeholder="Terrain 4" style={{ ...input, width: 170 }} />
          </label>
          {surfacesFor(nr.clubSportId).length > 0 && (
            <label style={label}>Surface
              <select value={nr.surface} onChange={(e) => setNr({ ...nr, surface: e.target.value })} style={input}>
                <option value="">—</option>
                {surfacesFor(nr.clubSportId).map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
          )}
          <label style={{ ...label, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <input type="checkbox" checked={nr.covered} onChange={(e) => setNr({ ...nr, covered: e.target.checked })} /> Couvert
          </label>
          <label style={label}>Format
            <select value={nr.format} onChange={(e) => setNr({ ...nr, format: e.target.value })} style={input}>
              {COURT_FORMATS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </label>
          <label style={label}>€ créneau plein
            <input type="number" min={1} step="0.5" value={nr.price} onChange={(e) => setNr({ ...nr, price: e.target.value })} style={{ ...input, width: 90 }} />
          </label>
          <label style={label}>€ créneau creux
            <input type="number" min={1} step="0.5" placeholder="—" value={nr.offPeakPrice} onChange={(e) => setNr({ ...nr, offPeakPrice: e.target.value })} style={{ ...input, width: 90 }} />
          </label>
          <label style={label}>Ouv.
            <input type="number" min={0} max={24} value={nr.openHour} onChange={(e) => setNr({ ...nr, openHour: e.target.value })} style={{ ...input, width: 60 }} />
          </label>
          <label style={label}>Ferm.
            <input type="number" min={0} max={24} value={nr.closeHour} onChange={(e) => setNr({ ...nr, closeHour: e.target.value })} style={{ ...input, width: 60 }} />
          </label>
          <label style={label}>Créneau
            <select value={nr.slotStepMin} onChange={(e) => setNr({ ...nr, slotStepMin: e.target.value })} style={input}>
              <option value="">Défaut</option>
              {STEP_OPTIONS.map((s) => <option key={s} value={s}>{s} min</option>)}
            </select>
          </label>
          <Btn onClick={create} disabled={creating || !nr.name.trim() || !nr.clubSportId} icon="plus">{creating ? 'Création…' : 'Créer'}</Btn>
        </div>
      </div>
    </div>
  );
}
