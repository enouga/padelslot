'use client';
import { useState, useEffect, useCallback, CSSProperties } from 'react';
import { api, ClubAdminDetail, UpdateClubBody } from '@/lib/api';
import { useAuth } from '@/lib/useAuth';
import { useClub } from '@/lib/ClubProvider';
import { useTheme } from '@/lib/ThemeProvider';
import { ACCENTS } from '@/lib/theme';
import { Btn } from '@/components/ui/atoms';

export default function AdminSettingsPage() {
  const { th } = useTheme();
  const { token, ready } = useAuth();
  const { club: hostClub } = useClub();
  const clubId = hostClub?.id;
  const [club, setClub]       = useState<ClubAdminDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [saved, setSaved]     = useState(false);

  const load = useCallback(async () => {
    if (!token || !clubId) return;
    setLoading(true);
    try { setError(null); setClub(await api.adminGetClub(clubId, token)); }
    catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }, [token, clubId]);

  useEffect(() => { if (ready && token && clubId) load(); }, [ready, token, clubId, load]);

  const set = <K extends keyof ClubAdminDetail>(k: K, v: ClubAdminDetail[K]) => {
    setSaved(false);
    setClub((c) => (c ? { ...c, [k]: v } : c));
  };

  const save = async () => {
    if (!token || !clubId || !club) return;
    setSaving(true);
    try {
      setError(null);
      const body: UpdateClubBody = {
        name: club.name, description: club.description ?? '', address: club.address,
        city: club.city ?? '', timezone: club.timezone, logoUrl: club.logoUrl ?? '',
        accentColor: club.accentColor, defaultThemeMode: club.defaultThemeMode,
        listedInDirectory: club.listedInDirectory,
        publicBookingDays: Number(club.publicBookingDays), memberBookingDays: Number(club.memberBookingDays),
      };
      await api.adminUpdateClub(clubId, body, token);
      setSaved(true);
    } catch (e) { setError((e as Error).message); }
    finally { setSaving(false); }
  };

  const field: CSSProperties = { width: '100%', height: 48, padding: '0 14px', borderRadius: 12, background: th.bg, color: th.text, border: `1px solid ${th.line}`, fontFamily: th.fontUI, fontSize: 15 };
  const label: CSSProperties = { fontFamily: th.fontUI, fontSize: 12.5, fontWeight: 600, letterSpacing: 0.3, textTransform: 'uppercase', color: th.textMute, display: 'block', marginBottom: 7 };
  const card: CSSProperties = { background: th.surface, borderRadius: 18, padding: 22, boxShadow: `inset 0 0 0 1px ${th.line}`, marginBottom: 16 };

  if (loading || !club) {
    return <div style={{ fontFamily: th.fontUI, color: th.textFaint, padding: '32px 0' }}>Chargement…</div>;
  }

  return (
    <div style={{ maxWidth: 640 }}>
      <h1 style={{ fontFamily: th.fontDisplay, fontWeight: 600, fontSize: 34, letterSpacing: -0.5, margin: '0 0 24px', color: th.text }}>Réglages du club</h1>

      {error && <div style={{ marginBottom: 16, background: th.accent, color: th.onAccent, borderRadius: 12, padding: '11px 14px', fontFamily: th.fontUI, fontSize: 13.5, fontWeight: 600 }}>{error}</div>}

      <div style={card}>
        <h2 style={{ fontFamily: th.fontDisplay, fontWeight: 600, fontSize: 20, margin: '0 0 16px', color: th.text }}>Profil</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div><span style={label}>Nom du club</span><input value={club.name} onChange={(e) => set('name', e.target.value)} style={field} /></div>
          <div><span style={label}>Description</span><textarea value={club.description ?? ''} onChange={(e) => set('description', e.target.value)} rows={2} style={{ ...field, height: 'auto', padding: '10px 14px', resize: 'vertical' }} /></div>
          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ flex: 2 }}><span style={label}>Adresse</span><input value={club.address} onChange={(e) => set('address', e.target.value)} style={field} /></div>
            <div style={{ flex: 1 }}><span style={label}>Ville</span><input value={club.city ?? ''} onChange={(e) => set('city', e.target.value)} style={field} /></div>
          </div>
          <div><span style={label}>Fuseau horaire</span><input value={club.timezone} onChange={(e) => set('timezone', e.target.value)} placeholder="Europe/Paris" style={field} /></div>
        </div>
      </div>

      <div style={card}>
        <h2 style={{ fontFamily: th.fontDisplay, fontWeight: 600, fontSize: 20, margin: '0 0 16px', color: th.text }}>Identité visuelle</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div><span style={label}>Logo (URL)</span><input value={club.logoUrl ?? ''} onChange={(e) => set('logoUrl', e.target.value)} placeholder="https://…/logo.png" style={field} /></div>
          <div>
            <span style={label}>Couleur d'accent</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              {Object.values(ACCENTS).map((hex) => (
                <button key={hex} type="button" onClick={() => set('accentColor', hex)} aria-label={`Accent ${hex}`}
                  style={{ width: 34, height: 34, borderRadius: 10, background: hex, cursor: 'pointer', border: club.accentColor.toLowerCase() === hex.toLowerCase() ? `2px solid ${th.text}` : `2px solid transparent`, boxShadow: `inset 0 0 0 1px ${th.line}` }} />
              ))}
              <input value={club.accentColor} onChange={(e) => set('accentColor', e.target.value)} style={{ ...field, width: 120, height: 34 }} />
            </div>
          </div>
          <div>
            <span style={label}>Thème par défaut</span>
            <select value={club.defaultThemeMode} onChange={(e) => set('defaultThemeMode', e.target.value)} style={field}>
              <option value="floodlit">Sombre (floodlit)</option>
              <option value="daylight">Clair (daylight)</option>
            </select>
          </div>
        </div>
      </div>

      <div style={card}>
        <h2 style={{ fontFamily: th.fontDisplay, fontWeight: 600, fontSize: 20, margin: '0 0 6px', color: th.text }}>Visibilité</h2>
        <p style={{ fontFamily: th.fontUI, fontSize: 13.5, color: th.textMute, margin: '0 0 16px' }}>Affiche votre club dans l'annuaire public et la recherche. Décoché, votre club reste accessible par son adresse directe (sous-domaine) mais n'apparaît pas dans l'annuaire.</p>
        <label style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}>
          <input type="checkbox" checked={club.listedInDirectory} onChange={(e) => set('listedInDirectory', e.target.checked)} style={{ width: 18, height: 18, accentColor: th.accent, cursor: 'pointer' }} />
          <span style={{ fontFamily: th.fontUI, fontSize: 15, color: th.text }}>Afficher mon club dans l'annuaire public</span>
        </label>
      </div>

      <div style={card}>
        <h2 style={{ fontFamily: th.fontDisplay, fontWeight: 600, fontSize: 20, margin: '0 0 6px', color: th.text }}>Réservation à l'avance</h2>
        <p style={{ fontFamily: th.fontUI, fontSize: 13.5, color: th.textMute, margin: '0 0 16px' }}>Nombre de jours pendant lesquels les joueurs peuvent réserver à l'avance. Les abonnés bénéficient d'une fenêtre élargie (réservent plus tôt).</p>
        <div style={{ display: 'flex', gap: 12 }}>
          <div style={{ flex: 1 }}><span style={label}>Public (jours)</span><input type="number" min={0} max={365} value={club.publicBookingDays} onChange={(e) => set('publicBookingDays', Number(e.target.value))} style={field} /></div>
          <div style={{ flex: 1 }}><span style={label}>Abonnés (jours)</span><input type="number" min={0} max={365} value={club.memberBookingDays} onChange={(e) => set('memberBookingDays', Number(e.target.value))} style={field} /></div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <Btn onClick={save} icon="check" disabled={saving}>{saving ? 'Enregistrement…' : 'Enregistrer'}</Btn>
        {saved && <span style={{ fontFamily: th.fontUI, fontSize: 14, color: th.mode === 'floodlit' ? th.accent : th.ink, fontWeight: 600 }}>Enregistré ✓</span>}
      </div>
    </div>
  );
}
