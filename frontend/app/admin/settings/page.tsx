'use client';
import { useState, useEffect, useCallback, CSSProperties } from 'react';
import { api, ClubAdminDetail, UpdateClubBody, OffPeakHours, BookingQuotas } from '@/lib/api';
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

  // Plages d'heures creuses par jour (weekday Luxon 1=lundi..7=dimanche), plusieurs
  // possibles par jour. Jour sans plage = tout en heures pleines.
  const DAYS: [number, string][] = [[1, 'Lundi'], [2, 'Mardi'], [3, 'Mercredi'], [4, 'Jeudi'], [5, 'Vendredi'], [6, 'Samedi'], [7, 'Dimanche']];
  const HOURS = Array.from({ length: 25 }, (_, h) => h); // 0..24
  const MINS = [0, 15, 30, 45];
  const updateOffPeak = (fn: (oph: OffPeakHours) => void) => {
    setSaved(false);
    setClub((c) => {
      if (!c) return c;
      const oph: OffPeakHours = Object.fromEntries(Object.entries(c.offPeakHours ?? {}).map(([d, r]) => [d, [...r]]));
      fn(oph);
      return { ...c, offPeakHours: oph };
    });
  };
  const addRange = (day: number) => updateOffPeak((oph) => {
    const ranges = oph[day] ?? [];
    // Nouvelle plage à la suite de la dernière (ou 9h-12h pour la première).
    const start = ranges.length ? Math.min(22, ranges[ranges.length - 1].end + 2) : 9;
    oph[day] = [...ranges, { start, end: Math.min(24, start + 3) }];
  });
  const removeRange = (day: number, idx: number) => updateOffPeak((oph) => {
    const ranges = (oph[day] ?? []).filter((_, i) => i !== idx);
    if (ranges.length) oph[day] = ranges;
    else delete oph[day];
  });
  const setRangeField = (day: number, idx: number, field: 'start' | 'startMin' | 'end' | 'endMin', value: number) => updateOffPeak((oph) => {
    const ranges = oph[day] ?? [];
    const max = field === 'start' || field === 'end' ? 24 : 59;
    ranges[idx] = { ...ranges[idx], [field]: Math.max(0, Math.min(max, value || 0)) };
    oph[day] = ranges;
  });

  // Quotas de réservations (réglage club, null = désactivé).
  const EMPTY_QUOTAS: BookingQuotas = {
    model: 'UPCOMING',
    subscriber: { peak: null, offPeak: null },
    nonSubscriber: { peak: null, offPeak: null },
  };
  const quotas = club?.bookingQuotas ?? null;
  const setQuotas = (q: BookingQuotas | null) => { setSaved(false); setClub((c) => (c ? { ...c, bookingQuotas: q } : c)); };
  const setQuotaLimit = (who: 'subscriber' | 'nonSubscriber', kind: 'peak' | 'offPeak', raw: string) => {
    if (!quotas) return;
    const v = raw === '' ? null : Math.max(0, Math.min(999, Math.trunc(Number(raw))));
    setQuotas({ ...quotas, [who]: { ...quotas[who], [kind]: Number.isFinite(v as number) || v === null ? v : null } });
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
        offPeakHours: club.offPeakHours && Object.keys(club.offPeakHours).length > 0 ? club.offPeakHours : null,
        bookingQuotas: club.bookingQuotas ?? null,
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

      <div style={card}>
        <h2 style={{ fontFamily: th.fontDisplay, fontWeight: 600, fontSize: 20, margin: '0 0 6px', color: th.text }}>Heures pleines / creuses</h2>
        <p style={{ fontFamily: th.fontUI, fontSize: 13.5, color: th.textMute, margin: '0 0 16px' }}>Ajoutez des plages d&apos;<strong>heures creuses</strong> (tarif réduit) jour par jour — plusieurs plages possibles. Le reste de la journée est en <strong>heures pleines</strong> ; un jour sans plage est entièrement en heures pleines. Le tarif des heures creuses se règle par terrain dans <strong>Ressources</strong>.</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {DAYS.map(([day, name]) => {
            const ranges = club.offPeakHours?.[day] ?? [];
            return (
              <div key={day} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
                <span style={{ fontFamily: th.fontUI, fontSize: 14.5, color: th.text, width: 110, paddingTop: ranges.length ? 9 : 2 }}>{name}</span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1, minWidth: 260 }}>
                  {ranges.length === 0 && (
                    <span style={{ fontFamily: th.fontUI, fontSize: 13.5, color: th.textFaint, paddingTop: 2 }}>tout en heures pleines</span>
                  )}
                  {ranges.map((r, idx) => (
                    <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 4, fontFamily: th.fontUI, fontSize: 14, color: th.textMute, flexWrap: 'wrap' }}>
                      creuses de
                      <select value={r.start} onChange={(e) => setRangeField(day, idx, 'start', Number(e.target.value))} style={{ ...field, width: 62, height: 40, padding: '0 4px' }}>
                        {HOURS.map((h) => <option key={h} value={h}>{h}</option>)}
                      </select>
                      h
                      <select value={r.startMin ?? 0} onChange={(e) => setRangeField(day, idx, 'startMin', Number(e.target.value))} style={{ ...field, width: 62, height: 40, padding: '0 4px' }}>
                        {MINS.map((m) => <option key={m} value={m}>{String(m).padStart(2, '0')}</option>)}
                      </select>
                      à
                      <select value={r.end} onChange={(e) => setRangeField(day, idx, 'end', Number(e.target.value))} style={{ ...field, width: 62, height: 40, padding: '0 4px' }}>
                        {HOURS.map((h) => <option key={h} value={h}>{h}</option>)}
                      </select>
                      h
                      <select value={r.endMin ?? 0} onChange={(e) => setRangeField(day, idx, 'endMin', Number(e.target.value))} style={{ ...field, width: 62, height: 40, padding: '0 4px' }}>
                        {MINS.map((m) => <option key={m} value={m}>{String(m).padStart(2, '0')}</option>)}
                      </select>
                      <button type="button" onClick={() => removeRange(day, idx)} aria-label={`Supprimer la plage ${r.start}h-${r.end}h de ${name}`}
                        style={{ marginLeft: 4, width: 28, height: 28, borderRadius: 8, background: 'transparent', color: th.textMute, border: `1px solid ${th.line}`, cursor: 'pointer', fontSize: 15, lineHeight: 1 }}>×</button>
                    </div>
                  ))}
                  <button type="button" onClick={() => addRange(day)}
                    style={{ alignSelf: 'flex-start', padding: '5px 10px', borderRadius: 8, background: 'transparent', color: th.textMute, border: `1px dashed ${th.line}`, cursor: 'pointer', fontFamily: th.fontUI, fontSize: 12.5, fontWeight: 600 }}>
                    + Ajouter une plage
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div style={card}>
        <h2 style={{ fontFamily: th.fontDisplay, fontWeight: 600, fontSize: 20, margin: '0 0 6px', color: th.text }}>Quotas de réservation</h2>
        <p style={{ fontFamily: th.fontUI, fontSize: 13.5, color: th.textMute, margin: '0 0 14px' }}>
          Limitez le nombre de réservations de terrain par joueur, en heures pleines et en heures creuses,
          avec des limites différentes pour les abonnés. Vide = illimité, 0 = bloqué.
          Une réservation compte en heures creuses si elle est <strong>entièrement</strong> dans les plages creuses ci-dessus.
        </p>
        <label style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', marginBottom: quotas ? 16 : 0 }}>
          <input type="checkbox" checked={!!quotas} onChange={(e) => setQuotas(e.target.checked ? EMPTY_QUOTAS : null)}
            style={{ width: 18, height: 18, accentColor: th.accent, cursor: 'pointer' }} />
          <span style={{ fontFamily: th.fontUI, fontSize: 15, color: th.text }}>Limiter les réservations par joueur</span>
        </label>
        {quotas && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <span style={label}>Période de comptage</span>
              <select value={quotas.model} onChange={(e) => setQuotas({ ...quotas, model: e.target.value as BookingQuotas['model'] })} style={field}>
                <option value="UPCOMING">Réservations à venir simultanées</option>
                <option value="WEEKLY">Par semaine calendaire (lun.–dim.)</option>
              </select>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr 1fr', gap: 10, alignItems: 'center', fontFamily: th.fontUI, fontSize: 14, color: th.text }}>
              <span />
              <span style={{ ...label, marginBottom: 0 }}>Heures pleines</span>
              <span style={{ ...label, marginBottom: 0 }}>Heures creuses</span>
              {(['nonSubscriber', 'subscriber'] as const).map((who) => (
                <span key={`${who}-row`} style={{ display: 'contents' }}>
                  <span>{who === 'subscriber' ? 'Abonnés' : 'Non-abonnés'}</span>
                  <input type="number" min={0} max={999} placeholder="illimité" value={quotas[who].peak ?? ''}
                    onChange={(e) => setQuotaLimit(who, 'peak', e.target.value)} style={field} />
                  <input type="number" min={0} max={999} placeholder="illimité" value={quotas[who].offPeak ?? ''}
                    onChange={(e) => setQuotaLimit(who, 'offPeak', e.target.value)} style={field} />
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <Btn onClick={save} icon="check" disabled={saving}>{saving ? 'Enregistrement…' : 'Enregistrer'}</Btn>
        {saved && <span style={{ fontFamily: th.fontUI, fontSize: 14, color: th.mode === 'floodlit' ? th.accent : th.ink, fontWeight: 600 }}>Enregistré ✓</span>}
      </div>
    </div>
  );
}
