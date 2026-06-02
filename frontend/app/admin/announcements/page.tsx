'use client';
import { useState, useEffect, useCallback, CSSProperties } from 'react';
import { api, Announcement, AnnouncementBody } from '@/lib/api';
import { useAuth } from '@/lib/useAuth';
import { useClub } from '@/lib/ClubProvider';
import { useTheme } from '@/lib/ThemeProvider';
import { Btn, Chip } from '@/components/ui/atoms';

const EMPTY = { title: '', body: '', linkUrl: '', imageUrl: '', pinned: false, isPublished: true };

export default function AdminAnnouncementsPage() {
  const { th } = useTheme();
  const { token, ready } = useAuth();
  const { club } = useClub();
  const clubId = club?.id;
  const [items, setItems]     = useState<Announcement[]>([]);
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
    try { setError(null); setItems(await api.adminGetAnnouncements(clubId, token)); }
    catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }, [token, clubId]);

  useEffect(() => { if (ready && token && clubId) load(); }, [ready, token, clubId, load]);

  const resetForm = () => { setForm(EMPTY); setEditId(null); };

  const submit = async () => {
    if (!token || !clubId || !form.title.trim()) return;
    setSaving(true);
    const body: AnnouncementBody = {
      title: form.title.trim(),
      body: form.body.trim(),
      linkUrl: form.linkUrl.trim() || undefined,
      imageUrl: form.imageUrl.trim() || undefined,
      pinned: form.pinned,
      isPublished: form.isPublished,
    };
    try {
      setError(null);
      if (editId) await api.adminUpdateAnnouncement(clubId, editId, body, token);
      else await api.adminCreateAnnouncement(clubId, body, token);
      resetForm();
      await load();
    } catch (e) { setError((e as Error).message); }
    finally { setSaving(false); }
  };

  const startEdit = (a: Announcement) => {
    setEditId(a.id);
    setForm({
      title: a.title, body: a.body, linkUrl: a.linkUrl ?? '', imageUrl: a.imageUrl ?? '',
      pinned: a.pinned, isPublished: a.isPublished,
    });
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const remove = async (a: Announcement) => {
    if (!token || !clubId) return;
    try { setError(null); await api.adminDeleteAnnouncement(clubId, a.id, token); if (editId === a.id) resetForm(); await load(); }
    catch (e) { setError((e as Error).message); }
  };

  return (
    <div style={{ maxWidth: 720 }}>
      <h1 style={{ fontFamily: th.fontDisplay, fontWeight: 600, fontSize: 34, letterSpacing: -0.5, margin: '0 0 8px', color: th.text }}>Annonces</h1>
      <p style={{ fontFamily: th.fontUI, fontSize: 14, color: th.textMute, margin: '0 0 22px' }}>Publiez des actualités visibles par les joueurs sur la page du club.</p>

      {error && <div style={{ marginBottom: 16, background: th.accent, color: th.onAccent, borderRadius: 12, padding: '11px 14px', fontFamily: th.fontUI, fontSize: 13.5, fontWeight: 600 }}>{error}</div>}

      <div style={{ background: th.surface, borderRadius: 18, padding: 18, boxShadow: `inset 0 0 0 1px ${th.line}`, marginBottom: 16 }}>
        <h2 style={{ fontFamily: th.fontDisplay, fontWeight: 600, fontSize: 20, margin: '0 0 14px', color: th.text }}>{editId ? "Modifier l'annonce" : 'Nouvelle annonce'}</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <label style={labelStyle}>
            Titre *
            <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Titre de l'annonce" style={inputStyle} />
          </label>
          <label style={labelStyle}>
            Contenu
            <textarea value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} placeholder="Détail de l'annonce…" rows={4}
              style={{ ...inputStyle, height: 'auto', padding: '12px 14px', resize: 'vertical', lineHeight: 1.5 }} />
          </label>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <label style={{ ...labelStyle, flex: 1, minWidth: 220 }}>
              Lien (optionnel)
              <input value={form.linkUrl} onChange={(e) => setForm({ ...form, linkUrl: e.target.value })} placeholder="https://…" type="url" style={inputStyle} />
            </label>
            <label style={{ ...labelStyle, flex: 1, minWidth: 220 }}>
              Image (optionnel)
              <input value={form.imageUrl} onChange={(e) => setForm({ ...form, imageUrl: e.target.value })} placeholder="https://…/image.jpg" type="url" style={inputStyle} />
            </label>
          </div>
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginTop: 2 }}>
            <label style={checkboxLabel}>
              <input type="checkbox" checked={form.pinned} onChange={(e) => setForm({ ...form, pinned: e.target.checked })} style={{ width: 18, height: 18, accentColor: th.accent }} />
              Épinglée
            </label>
            <label style={checkboxLabel}>
              <input type="checkbox" checked={form.isPublished} onChange={(e) => setForm({ ...form, isPublished: e.target.checked })} style={{ width: 18, height: 18, accentColor: th.accent }} />
              Publiée
            </label>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
            <Btn onClick={submit} icon={editId ? 'check' : 'plus'} disabled={saving || !form.title.trim()}>{saving ? '…' : editId ? 'Enregistrer' : 'Publier'}</Btn>
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
                {['Annonce', 'Statut', 'Créée le', ''].map((h, i) => (
                  <th key={i} style={{ padding: '12px 16px', fontFamily: th.fontUI, fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.3, color: th.textMute }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && <tr><td colSpan={4} style={{ ...cell, textAlign: 'center', color: th.textFaint, padding: '28px 16px' }}>Aucune annonce pour l'instant.</td></tr>}
              {items.map((a) => (
                <tr key={a.id} style={{ borderBottom: `1px solid ${th.line}` }}>
                  <td style={{ ...cell, maxWidth: 360 }}>
                    <div style={{ fontWeight: 600, marginBottom: a.body ? 3 : 0 }}>{a.title}</div>
                    {a.body && <div style={{ color: th.textMute, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.body}</div>}
                  </td>
                  <td style={cell}>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {a.pinned && <Chip tone="accent" icon="pin">Épinglée</Chip>}
                      {!a.isPublished && <Chip tone="line">Brouillon</Chip>}
                      {a.isPublished && !a.pinned && <Chip tone="mute">Publiée</Chip>}
                    </div>
                  </td>
                  <td style={{ ...cell, color: th.textMute, whiteSpace: 'nowrap' }}>{new Date(a.createdAt).toLocaleDateString('fr-FR')}</td>
                  <td style={cell}>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => startEdit(a)} style={{ border: `1px solid ${th.line}`, background: 'transparent', cursor: 'pointer', borderRadius: 9, padding: '6px 12px', fontFamily: th.fontUI, fontSize: 12.5, fontWeight: 600, color: th.text }}>Modifier</button>
                      <button onClick={() => remove(a)} style={{ border: `1px solid ${th.line}`, background: 'transparent', cursor: 'pointer', borderRadius: 9, padding: '6px 12px', fontFamily: th.fontUI, fontSize: 12.5, fontWeight: 600, color: '#ff7a4d' }}>Supprimer</button>
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
