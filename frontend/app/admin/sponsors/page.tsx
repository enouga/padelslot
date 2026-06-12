'use client';
import { useState, useEffect, useCallback, CSSProperties } from 'react';
import { api, Sponsor, SponsorBody } from '@/lib/api';
import { useAuth } from '@/lib/useAuth';
import { useClub } from '@/lib/ClubProvider';
import { useTheme } from '@/lib/ThemeProvider';
import { Btn, Chip } from '@/components/ui/atoms';

const EMPTY = { name: '', logoUrl: '', linkUrl: '', sortOrder: '0', isActive: true, offerText: '', offerCode: '', offerUntil: '', pinned: false };

export default function AdminSponsorsPage() {
  const { th } = useTheme();
  const { token, ready } = useAuth();
  const { club } = useClub();
  const clubId = club?.id;
  const [items, setItems]     = useState<Sponsor[]>([]);
  const [form, setForm]       = useState(EMPTY);
  const [editId, setEditId]   = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState<string | null>(null);

  const cell: CSSProperties = { padding: '12px 16px', fontFamily: th.fontUI, fontSize: 14, color: th.text };
  const labelStyle: CSSProperties = { fontFamily: th.fontUI, fontSize: 12.5, fontWeight: 600, color: th.textMute, display: 'flex', flexDirection: 'column', gap: 6 };
  const inputStyle: CSSProperties = { height: 46, padding: '0 14px', borderRadius: 12, background: th.bg, color: th.text, border: `1px solid ${th.line}`, fontFamily: th.fontUI, fontSize: 15 };
  const checkboxLabel: CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, fontFamily: th.fontUI, fontSize: 14, fontWeight: 600, color: th.text, cursor: 'pointer' };

  const load = useCallback(async () => {
    if (!token || !clubId) return;
    setLoading(true);
    try { setError(null); setItems(await api.adminGetSponsors(clubId, token)); }
    catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }, [token, clubId]);

  useEffect(() => { if (ready && token && clubId) load(); }, [ready, token, clubId, load]);

  const resetForm = () => { setForm(EMPTY); setEditId(null); };

  const submit = async () => {
    if (!token || !clubId || !form.name.trim() || !form.logoUrl.trim()) return;
    setSaving(true);
    const body: SponsorBody = {
      name: form.name.trim(),
      logoUrl: form.logoUrl.trim(),
      linkUrl: form.linkUrl.trim() || undefined,
      sortOrder: Number.parseInt(form.sortOrder, 10) || 0,
      isActive: form.isActive,
      offerText: form.offerText.trim(),
      offerCode: form.offerCode.trim(),
      offerUntil: form.offerUntil,
      pinned: form.pinned,
    };
    try {
      setError(null);
      if (editId) await api.adminUpdateSponsor(clubId, editId, body, token);
      else await api.adminCreateSponsor(clubId, body, token);
      resetForm();
      await load();
    } catch (e) { setError((e as Error).message); }
    finally { setSaving(false); }
  };

  const startEdit = (s: Sponsor) => {
    setEditId(s.id);
    setForm({
      name: s.name, logoUrl: s.logoUrl, linkUrl: s.linkUrl ?? '',
      sortOrder: String(s.sortOrder), isActive: s.isActive,
      offerText: s.offerText ?? '', offerCode: s.offerCode ?? '',
      offerUntil: s.offerUntil?.slice(0, 10) ?? '', pinned: s.pinned,
    });
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const remove = async (s: Sponsor) => {
    if (!token || !clubId) return;
    try { setError(null); await api.adminDeleteSponsor(clubId, s.id, token); if (editId === s.id) resetForm(); await load(); }
    catch (e) { setError((e as Error).message); }
  };

  const canSubmit = !!form.name.trim() && !!form.logoUrl.trim();

  return (
    <div style={{ maxWidth: 720 }}>
      <h1 style={{ fontFamily: th.fontDisplay, fontWeight: 600, fontSize: 34, letterSpacing: -0.5, margin: '0 0 8px', color: th.text }}>Partenaires</h1>
      <p style={{ fontFamily: th.fontUI, fontSize: 14, color: th.textMute, margin: '0 0 22px' }}>Mettez en avant les sponsors et partenaires du club, classés par ordre d&apos;affichage.</p>

      {error && <div style={{ marginBottom: 16, background: th.accent, color: th.onAccent, borderRadius: 12, padding: '11px 14px', fontFamily: th.fontUI, fontSize: 13.5, fontWeight: 600 }}>{error}</div>}

      <div style={{ background: th.surface, borderRadius: 18, padding: 18, boxShadow: `inset 0 0 0 1px ${th.line}`, marginBottom: 16 }}>
        <h2 style={{ fontFamily: th.fontDisplay, fontWeight: 600, fontSize: 20, margin: '0 0 14px', color: th.text }}>{editId ? 'Modifier le partenaire' : 'Nouveau partenaire'}</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <label style={{ ...labelStyle, flex: 1, minWidth: 220 }}>
              Nom *
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Nom du partenaire" style={inputStyle} />
            </label>
            <label style={{ ...labelStyle, flex: 1, minWidth: 220 }}>
              URL du logo *
              <input value={form.logoUrl} onChange={(e) => setForm({ ...form, logoUrl: e.target.value })} placeholder="https://…/logo.png" type="url" style={inputStyle} />
            </label>
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <label style={{ ...labelStyle, flex: 1, minWidth: 220 }}>
              Lien (optionnel)
              <input value={form.linkUrl} onChange={(e) => setForm({ ...form, linkUrl: e.target.value })} placeholder="https://…" type="url" style={inputStyle} />
            </label>
            <label style={{ ...labelStyle, width: 140 }}>
              Ordre d&apos;affichage
              <input value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: e.target.value })} type="number" style={inputStyle} />
            </label>
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <label style={{ ...labelStyle, flex: 1, minWidth: 220 }}>
              Offre (optionnel)
              <input value={form.offerText} onChange={(e) => setForm({ ...form, offerText: e.target.value })} placeholder="−10 % sur les raquettes en boutique" style={inputStyle} />
            </label>
            <label style={{ ...labelStyle, width: 160 }}>
              Code promo
              <input value={form.offerCode} onChange={(e) => setForm({ ...form, offerCode: e.target.value })} placeholder="TPC10" style={inputStyle} />
            </label>
            <label style={{ ...labelStyle, width: 200 }}>
              Offre valable jusqu&apos;au
              <input value={form.offerUntil} onChange={(e) => setForm({ ...form, offerUntil: e.target.value })} type="date" style={inputStyle} />
            </label>
          </div>
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginTop: 2 }}>
            <label style={checkboxLabel}>
              <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} style={{ width: 18, height: 18, accentColor: th.accent }} />
              Actif
            </label>
            <label style={checkboxLabel}>
              <input type="checkbox" checked={form.pinned} onChange={(e) => setForm({ ...form, pinned: e.target.checked })} style={{ width: 18, height: 18, accentColor: th.accent }} />
              À la une (grande carte en tête de section)
            </label>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
            <Btn onClick={submit} icon={editId ? 'check' : 'plus'} disabled={saving || !canSubmit}>{saving ? '…' : editId ? 'Enregistrer' : 'Ajouter'}</Btn>
            {editId && <Btn variant="ghost" onClick={resetForm} disabled={saving}>Annuler</Btn>}
          </div>
        </div>
      </div>

      {loading ? (
        <div style={{ padding: '32px 0', fontFamily: th.fontUI, color: th.textFaint }}>Chargement…</div>
      ) : (
        <div style={{ overflowX: 'auto', borderRadius: 18, background: th.surface, boxShadow: `inset 0 0 0 1px ${th.line}` }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${th.line}`, textAlign: 'left' }}>
                {['Logo', 'Partenaire', 'Offre', 'Ordre', 'Statut', ''].map((h, i) => (
                  <th key={i} style={{ padding: '12px 16px', fontFamily: th.fontUI, fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.3, color: th.textMute }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && <tr><td colSpan={6} style={{ ...cell, textAlign: 'center', color: th.textFaint, padding: '28px 16px' }}>Aucun partenaire pour l&apos;instant.</td></tr>}
              {items.map((s) => (
                <tr key={s.id} style={{ borderBottom: `1px solid ${th.line}` }}>
                  <td style={cell}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={s.logoUrl} alt={s.name} style={{ height: 32, width: 'auto', maxWidth: 80, objectFit: 'contain', borderRadius: 6, display: 'block' }} />
                  </td>
                  <td style={{ ...cell, fontWeight: 600 }}>
                    {s.name}{s.pinned && <span style={{ marginLeft: 8, verticalAlign: 'middle', display: 'inline-flex' }}><Chip tone="accent">À la une</Chip></span>}
                  </td>
                  <td style={{ ...cell, color: th.textMute, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {s.offerText ?? '—'}{s.offerCode ? ` · ${s.offerCode}` : ''}
                    {s.offerUntil ? ` · jusqu'au ${new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', timeZone: 'UTC' }).format(new Date(s.offerUntil))}` : ''}
                  </td>
                  <td style={{ ...cell, color: th.textMute }}>{s.sortOrder}</td>
                  <td style={cell}>
                    {s.isActive ? <Chip tone="accent">Actif</Chip> : <Chip tone="line">Inactif</Chip>}
                  </td>
                  <td style={cell}>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => startEdit(s)} style={{ border: `1px solid ${th.line}`, background: 'transparent', cursor: 'pointer', borderRadius: 9, padding: '6px 12px', fontFamily: th.fontUI, fontSize: 12.5, fontWeight: 600, color: th.text }}>Modifier</button>
                      <button onClick={() => remove(s)} style={{ border: `1px solid ${th.line}`, background: 'transparent', cursor: 'pointer', borderRadius: 9, padding: '6px 12px', fontFamily: th.fontUI, fontSize: 12.5, fontWeight: 600, color: '#ff7a4d' }}>Supprimer</button>
                    </div>
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
