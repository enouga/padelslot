'use client';
import { useState, useEffect, useCallback, Fragment, CSSProperties } from 'react';
import { api, ClubReservation, ClubReservationsResponse, PaymentMethod } from '@/lib/api';
import { useAuth } from '@/lib/useAuth';
import { useTheme } from '@/lib/ThemeProvider';
import { Btn } from '@/components/ui/atoms';

function fmt(iso: string): string {
  return new Date(iso).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
}

const STATUS_LABEL: Record<string, string> = { PENDING: 'En attente', CONFIRMED: 'Confirmée', CANCELLED: 'Annulée' };
const METHOD_LABEL: Record<PaymentMethod, string> = { CASH: 'Espèces', CARD: 'Carte', TRANSFER: 'Virement', ONLINE: 'En ligne', OTHER: 'Autre' };

export default function AdminReservationsPage() {
  const { th } = useTheme();
  const { token, clubId, ready } = useAuth();
  const [data, setData]   = useState<ClubReservationsResponse | null>(null);
  const [date, setDate]   = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [form, setForm] = useState<{ amount: string; method: PaymentMethod; payerName: string }>({ amount: '', method: 'CASH', payerName: '' });
  const [saving, setSaving] = useState(false);

  const cell: CSSProperties = { padding: '12px 16px', fontFamily: th.fontUI, fontSize: 14, color: th.text };
  const input: CSSProperties = { border: `1px solid ${th.line}`, background: th.bg, color: th.text, borderRadius: 8, padding: '7px 10px', fontFamily: th.fontUI, fontSize: 14 };

  const statusStyle = (s: string): CSSProperties => ({
    borderRadius: 999, padding: '4px 11px', fontFamily: th.fontUI, fontSize: 12, fontWeight: 600,
    background: s === 'CONFIRMED' ? `${th.accent}22` : s === 'PENDING' ? th.surfaceHi : th.surface2,
    color: s === 'CONFIRMED' ? (th.mode === 'floodlit' ? th.accent : th.ink) : s === 'CANCELLED' ? th.textFaint : th.textMute,
  });

  const load = useCallback(async () => {
    if (!token || !clubId) return;
    setLoading(true);
    try { setError(null); setData(await api.adminGetReservations(clubId, date ? { date } : {}, token)); }
    catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }, [token, clubId, date]);

  useEffect(() => { if (ready && token && clubId) load(); }, [ready, token, clubId, load]);

  const cancel = async (r: ClubReservation) => {
    if (!token || !clubId) return;
    try { setError(null); await api.adminCancelReservation(clubId, r.id, token); await load(); }
    catch (e) { setError((e as Error).message); }
  };

  const openPanel = (r: ClubReservation) => {
    if (openId === r.id) { setOpenId(null); return; }
    setOpenId(r.id);
    const remaining = Math.max(0, Number(r.totalPrice) - Number(r.paidAmount));
    setForm({ amount: remaining ? String(remaining) : '', method: 'CASH', payerName: '' });
  };

  const addPayment = async (r: ClubReservation) => {
    if (!token || !clubId) return;
    const amount = Number(form.amount);
    if (!amount || amount <= 0) { setError('Montant invalide.'); return; }
    setSaving(true);
    try {
      setError(null);
      await api.adminAddPayment(clubId, r.id, { amount, method: form.method, payerName: form.payerName || undefined }, token);
      await load();
      setOpenId(null);
    } catch (e) { setError((e as Error).message); }
    finally { setSaving(false); }
  };

  return (
    <div>
      <h1 style={{ fontFamily: th.fontDisplay, fontWeight: 600, fontSize: 34, letterSpacing: -0.5, margin: '0 0 20px', color: th.text }}>Réservations & paiements</h1>

      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
        <label style={{ fontFamily: th.fontUI, fontSize: 13.5, color: th.textMute, display: 'flex', alignItems: 'center', gap: 8 }}>
          Jour
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={input} />
        </label>
        {date && <button onClick={() => setDate('')} style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: th.fontUI, fontSize: 13.5, color: th.accent }}>Tout afficher</button>}
      </div>

      {error && <div style={{ marginBottom: 16, background: th.accent, color: th.onAccent, borderRadius: 12, padding: '11px 14px', fontFamily: th.fontUI, fontSize: 13.5, fontWeight: 600 }}>{error}</div>}

      {data && (
        <div style={{ display: 'flex', gap: 24, marginBottom: 16, fontFamily: th.fontUI, fontSize: 14, flexWrap: 'wrap' }}>
          <span style={{ color: th.textMute }}>Total dû : <b style={{ color: th.text }}>{data.summary.total} €</b></span>
          <span style={{ color: th.textMute }}>Encaissé : <b style={{ color: th.mode === 'floodlit' ? th.accent : th.ink }}>{data.summary.paid} €</b></span>
          <span style={{ color: th.textMute }}>Reste dû : <b style={{ color: '#ff7a4d' }}>{data.summary.outstanding} €</b></span>
        </div>
      )}

      {loading ? (
        <div style={{ padding: '32px 0', fontFamily: th.fontUI, color: th.textFaint }}>Chargement…</div>
      ) : (
        <div style={{ overflowX: 'auto', borderRadius: 18, background: th.surface, boxShadow: `inset 0 0 0 1px ${th.line}` }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${th.line}`, textAlign: 'left' }}>
                {['Ressource', 'Client', 'Début', 'Montant', 'Payé', 'Statut', ''].map((h, i) => (
                  <th key={i} style={{ padding: '12px 16px', fontFamily: th.fontUI, fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.3, color: th.textMute }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data?.reservations.length === 0 && (
                <tr><td colSpan={7} style={{ ...cell, textAlign: 'center', color: th.textFaint, padding: '32px 16px' }}>Aucune réservation</td></tr>
              )}
              {data?.reservations.map((r) => {
                const remaining = Math.max(0, Number(r.totalPrice) - Number(r.paidAmount));
                const fullyPaid = remaining <= 0 && r.status !== 'CANCELLED';
                const open = openId === r.id;
                return (
                  <Fragment key={r.id}>
                    <tr style={{ borderBottom: open ? 'none' : `1px solid ${th.line}` }}>
                      <td style={{ ...cell, fontWeight: 600 }}>{r.resource.name}</td>
                      <td style={cell}>{r.user.firstName} {r.user.lastName}<div style={{ fontSize: 12, color: th.textFaint }}>{r.user.email}</div></td>
                      <td style={{ ...cell, fontFamily: th.fontMono, fontSize: 13 }}>{fmt(r.startTime)}</td>
                      <td style={cell}>{r.totalPrice} €</td>
                      <td style={cell}>
                        <span style={{ fontWeight: 600, color: fullyPaid ? (th.mode === 'floodlit' ? th.accent : th.ink) : th.text }}>{r.paidAmount} €</span>
                        {r.status !== 'CANCELLED' && remaining > 0 && <span style={{ fontSize: 12, color: '#ff7a4d', marginLeft: 6 }}>reste {remaining.toFixed(2)} €</span>}
                        {fullyPaid && <span style={{ fontSize: 12, color: th.textMute, marginLeft: 6 }}>✓</span>}
                      </td>
                      <td style={cell}><span style={statusStyle(r.status)}>{STATUS_LABEL[r.status]}</span></td>
                      <td style={{ ...cell, whiteSpace: 'nowrap' }}>
                        {r.status !== 'CANCELLED' && (
                          <button onClick={() => openPanel(r)} style={{ border: 'none', cursor: 'pointer', borderRadius: 9, padding: '6px 11px', fontFamily: th.fontUI, fontSize: 12.5, fontWeight: 600, background: th.accent, color: th.onAccent, marginRight: 8 }}>
                            Encaisser{r.payments.length ? ` (${r.payments.length})` : ''}
                          </button>
                        )}
                        {r.status !== 'CANCELLED' && (
                          <button onClick={() => cancel(r)} style={{ border: `1px solid ${th.line}`, background: 'transparent', cursor: 'pointer', borderRadius: 9, padding: '6px 11px', fontFamily: th.fontUI, fontSize: 12.5, fontWeight: 600, color: '#ff7a4d' }}>Annuler</button>
                        )}
                      </td>
                    </tr>
                    {open && (
                      <tr style={{ borderBottom: `1px solid ${th.line}` }}>
                        <td colSpan={7} style={{ padding: '0 16px 16px', background: th.bgElev }}>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, paddingTop: 14 }}>
                            {/* liste paiements */}
                            <div style={{ flex: 1, minWidth: 240 }}>
                              <div style={{ fontFamily: th.fontUI, fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, color: th.textMute, marginBottom: 8 }}>Encaissements</div>
                              {r.payments.length === 0 ? (
                                <div style={{ fontFamily: th.fontUI, fontSize: 13.5, color: th.textFaint }}>Aucun encaissement.</div>
                              ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                  {r.payments.map((p) => (
                                    <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, fontFamily: th.fontUI, fontSize: 13.5, color: th.text }}>
                                      <span style={{ fontWeight: 700, minWidth: 64 }}>{p.amount} €</span>
                                      <span style={{ color: th.textMute }}>{METHOD_LABEL[p.method]}</span>
                                      {p.payerName && <span style={{ color: th.textMute }}>· {p.payerName}</span>}
                                      <span style={{ fontFamily: th.fontMono, fontSize: 12, color: th.textFaint, marginLeft: 'auto' }}>{fmt(p.createdAt)}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                            {/* formulaire ajout */}
                            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
                              <label style={{ fontFamily: th.fontUI, fontSize: 12, color: th.textMute, display: 'flex', flexDirection: 'column', gap: 4 }}>Montant €
                                <input type="number" min={0} step="0.5" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} style={{ ...input, width: 90 }} />
                              </label>
                              <label style={{ fontFamily: th.fontUI, fontSize: 12, color: th.textMute, display: 'flex', flexDirection: 'column', gap: 4 }}>Moyen
                                <select value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value as PaymentMethod })} style={input}>
                                  {(Object.keys(METHOD_LABEL) as PaymentMethod[]).map((m) => <option key={m} value={m}>{METHOD_LABEL[m]}</option>)}
                                </select>
                              </label>
                              <label style={{ fontFamily: th.fontUI, fontSize: 12, color: th.textMute, display: 'flex', flexDirection: 'column', gap: 4 }}>Payé par
                                <input value={form.payerName} onChange={(e) => setForm({ ...form, payerName: e.target.value })} placeholder="(optionnel)" style={{ ...input, width: 140 }} />
                              </label>
                              <Btn onClick={() => addPayment(r)} icon="check" disabled={saving}>{saving ? '…' : 'Encaisser'}</Btn>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
