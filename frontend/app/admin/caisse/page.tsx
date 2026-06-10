'use client';
import { useState, useEffect, useCallback } from 'react';
import { api, CaisseSummary, CaissePayment, Member, MemberPackage, PackageTemplate, PaymentMethod } from '@/lib/api';
import { packageLabel } from '@/lib/packages';
import { useAuth } from '@/lib/useAuth';
import { useClub } from '@/lib/ClubProvider';
import { useTheme } from '@/lib/ThemeProvider';
import { Btn } from '@/components/ui/atoms';

const METHOD_LABEL: Record<PaymentMethod, string> = {
  CASH: 'Espèces', CARD: 'Carte', TRANSFER: 'Virement', ONLINE: 'En ligne', OTHER: 'Autre',
  VOUCHER: 'Ticket CE', PACK_CREDIT: 'Carnet', WALLET: 'Porte-monnaie',
};
// Méthodes qui font entrer de l'argent (les prépayés sont des consommations).
const MONEY_METHODS: PaymentMethod[] = ['CASH', 'CARD', 'TRANSFER', 'ONLINE', 'OTHER', 'VOUCHER'];
const SALE_METHODS: PaymentMethod[] = ['CASH', 'CARD', 'TRANSFER', 'VOUCHER', 'OTHER'];

function todayISO(): string { return new Date().toISOString().slice(0, 10); }
const euro = (s: string | number) => `${Number(s).toFixed(2).replace('.', ',')} €`;

function paymentLabel(p: CaissePayment): string {
  if (p.memberPackage) return `${p.memberPackage.user.firstName} ${p.memberPackage.user.lastName} · ${p.memberPackage.template.name}`;
  if (p.reservation) {
    const who = p.reservation.user ? `${p.reservation.user.firstName} ${p.reservation.user.lastName}` : 'Réservation';
    return `${who} · ${p.reservation.resource.name}`;
  }
  return p.payerName ?? 'Encaissement';
}

export default function AdminCaissePage() {
  const { th } = useTheme();
  const { token, ready } = useAuth();
  const { club } = useClub();
  const clubId = club?.id;

  const [date, setDate]         = useState(todayISO());
  const [caisse, setCaisse]     = useState<CaisseSummary | null>(null);
  const [outstanding, setOut]   = useState('0.00');
  const [vouchers, setVouchers] = useState<CaissePayment[]>([]);
  const [error, setError]       = useState<string | null>(null);
  const [busy, setBusy]         = useState(false);

  // vente de carnet
  const [members, setMembers]     = useState<Member[]>([]);
  const [templates, setTemplates] = useState<PackageTemplate[]>([]);
  const [query, setQuery]         = useState('');
  const [buyer, setBuyer]         = useState<Member | null>(null);
  const [buyerPackages, setBuyerPackages] = useState<MemberPackage[]>([]);
  const [sellTplId, setSellTplId] = useState('');
  const [sellMethod, setSellMethod] = useState<PaymentMethod>('CASH');
  const [sellRef, setSellRef]     = useState('');
  const [sellIssuer, setSellIssuer] = useState('');

  const load = useCallback(async () => {
    if (!token || !clubId) return;
    try {
      setError(null);
      const [c, resv, v, mem, tpl] = await Promise.all([
        api.adminGetCaisse(clubId, date, token),
        api.adminGetReservations(clubId, { date }, token),
        api.adminGetVouchers(clubId, 'PENDING_REIMBURSEMENT', token),
        api.adminGetMembers(clubId, token),
        api.adminGetPackageTemplates(clubId, token),
      ]);
      setCaisse(c);
      setOut(resv.summary.outstanding);
      setVouchers(v);
      setMembers(mem);
      setTemplates(tpl.filter((t) => t.isActive));
    } catch (e) { setError((e as Error).message); }
  }, [token, clubId, date]);

  useEffect(() => { if (ready && token && clubId) load(); }, [ready, token, clubId, load]);

  const pickBuyer = async (m: Member) => {
    if (!token || !clubId) return;
    setBuyer(m); setQuery('');
    try { setBuyerPackages(await api.adminGetMemberPackages(clubId, m.userId, token)); }
    catch (e) { setError((e as Error).message); }
  };

  const sell = async () => {
    if (!token || !clubId || !buyer || !sellTplId) return;
    if (sellMethod === 'VOUCHER' && !sellRef.trim()) { setError('Référence du ticket CE requise.'); return; }
    setBusy(true);
    try {
      setError(null);
      await api.adminSellPackage(clubId, buyer.userId, {
        templateId: sellTplId, method: sellMethod,
        payerName: `${buyer.firstName} ${buyer.lastName}`,
        voucherRef: sellMethod === 'VOUCHER' ? sellRef.trim() : undefined,
        voucherIssuer: sellMethod === 'VOUCHER' ? sellIssuer.trim() || undefined : undefined,
      }, token);
      setSellRef(''); setSellIssuer('');
      await Promise.all([load(), pickBuyer(buyer)]);
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };

  const reimburse = async (p: CaissePayment) => {
    if (!token || !clubId) return;
    setBusy(true);
    try { setError(null); await api.adminSetVoucherStatus(clubId, p.id, 'REIMBURSED', token); await load(); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };

  const matches = query.trim().length > 0 && !buyer
    ? members.filter((m) => `${m.firstName} ${m.lastName} ${m.email}`.toLowerCase().includes(query.toLowerCase())).slice(0, 6)
    : [];

  const moneyTotal = caisse
    ? MONEY_METHODS.reduce((s, m) => s + Number(caisse.totalsByMethod[m] ?? 0), 0)
    : 0;

  const input = { border: `1px solid ${th.line}`, background: th.bg, color: th.text, borderRadius: 8, padding: '8px 10px', fontFamily: th.fontUI, fontSize: 14 } as const;
  const card = { background: th.surface, borderRadius: 16, padding: 18, boxShadow: `inset 0 0 0 1px ${th.line}` } as const;
  const sectionTitle = { fontFamily: th.fontUI, fontSize: 13, fontWeight: 700 as const, color: th.text, marginBottom: 12 };
  const stat = (label: string, value: string) => (
    <div key={label}>
      <div style={{ fontFamily: th.fontMono, fontSize: 10, fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase', color: th.textFaint }}>{label}</div>
      <div style={{ fontFamily: th.fontDisplay, fontSize: 19, fontWeight: 600, color: th.text }}>{value}</div>
    </div>
  );

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, margin: '0 0 18px', flexWrap: 'wrap' }}>
        <h1 style={{ fontFamily: th.fontDisplay, fontWeight: 600, fontSize: 34, letterSpacing: -0.5, margin: 0, color: th.text }}>Caisse</h1>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={input} />
      </div>

      {error && <div style={{ marginBottom: 16, background: '#ff7a4d', color: '#fff', borderRadius: 12, padding: '11px 14px', fontFamily: th.fontUI, fontSize: 13.5, fontWeight: 600 }}>{error}</div>}

      {/* totaux du jour */}
      <div style={{ ...card, marginBottom: 18 }}>
        <div style={sectionTitle}>Journée du {date}</div>
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          {stat('Encaissé', euro(moneyTotal))}
          {stat('Reste dû (jour)', euro(outstanding))}
          {(Object.entries(caisse?.totalsByMethod ?? {}) as [PaymentMethod, string][]).map(([m, v]) => stat(METHOD_LABEL[m], euro(v)))}
        </div>
        <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {(caisse?.payments ?? []).map((p) => (
            <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, fontFamily: th.fontUI, fontSize: 13, color: th.text, padding: '7px 0', borderTop: `1px solid ${th.line}` }}>
              <span style={{ flex: 1 }}>{paymentLabel(p)}</span>
              <span style={{ color: th.textMute }}>{METHOD_LABEL[p.method]}{p.voucherRef ? ` · ${p.voucherRef}` : ''}</span>
              <b>{euro(p.amount)}</b>
            </div>
          ))}
          {caisse && caisse.payments.length === 0 && <div style={{ fontFamily: th.fontUI, fontSize: 13, color: th.textMute }}>Aucun encaissement ce jour.</div>}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 18 }}>
        {/* vente de carnet / porte-monnaie */}
        <div style={card}>
          <div style={sectionTitle}>Vendre une offre</div>
          <div style={{ position: 'relative', marginBottom: 12 }}>
            {buyer ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, border: `1px solid ${th.line}`, borderRadius: 8, padding: '8px 10px' }}>
                <span style={{ flex: 1, fontFamily: th.fontUI, fontSize: 14, color: th.text }}>{buyer.firstName} {buyer.lastName}</span>
                <button type="button" onClick={() => { setBuyer(null); setBuyerPackages([]); }} style={{ border: 'none', background: th.surface2, cursor: 'pointer', borderRadius: 8, padding: '3px 8px', color: th.textMute, fontSize: 12 }}>Changer</button>
              </div>
            ) : (
              <input type="text" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rechercher un membre…" style={{ ...input, width: '100%', boxSizing: 'border-box' }} />
            )}
            {matches.length > 0 && (
              <div style={{ position: 'absolute', left: 0, right: 0, top: '100%', zIndex: 10, background: th.surface, border: `1px solid ${th.line}`, borderRadius: 8, marginTop: 4, overflow: 'hidden', boxShadow: th.shadowSoft }}>
                {matches.map((m) => (
                  <button key={m.userId} type="button" onClick={() => pickBuyer(m)}
                    style={{ display: 'block', width: '100%', textAlign: 'left', border: 'none', background: 'transparent', cursor: 'pointer', padding: '8px 10px', fontFamily: th.fontUI, fontSize: 13.5, color: th.text }}>
                    {m.firstName} {m.lastName} <span style={{ color: th.textFaint }}>· {m.email}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {buyer && (
            <>
              {buyerPackages.length > 0 && (
                <div style={{ marginBottom: 12, fontFamily: th.fontUI, fontSize: 12.5, color: th.textMute }}>
                  Soldes actuels : {buyerPackages.map((p) => packageLabel(p)).join(' · ')}
                </div>
              )}
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <label style={{ fontSize: 12, color: th.textMute, display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 160 }}>Offre
                  <select value={sellTplId} onChange={(e) => setSellTplId(e.target.value)} style={input}>
                    <option value="">Choisir…</option>
                    {templates.map((t) => <option key={t.id} value={t.id}>{t.name} — {euro(t.price)}</option>)}
                  </select>
                </label>
                <label style={{ fontSize: 12, color: th.textMute, display: 'flex', flexDirection: 'column', gap: 4 }}>Moyen
                  <select value={sellMethod} onChange={(e) => setSellMethod(e.target.value as PaymentMethod)} style={input}>
                    {SALE_METHODS.map((m) => <option key={m} value={m}>{METHOD_LABEL[m]}</option>)}
                  </select>
                </label>
                {sellMethod === 'VOUCHER' && (
                  <>
                    <label style={{ fontSize: 12, color: th.textMute, display: 'flex', flexDirection: 'column', gap: 4 }}>Référence
                      <input type="text" value={sellRef} onChange={(e) => setSellRef(e.target.value)} placeholder="N° du ticket" style={{ ...input, width: 120 }} />
                    </label>
                    <label style={{ fontSize: 12, color: th.textMute, display: 'flex', flexDirection: 'column', gap: 4 }}>Émetteur
                      <input type="text" value={sellIssuer} onChange={(e) => setSellIssuer(e.target.value)} placeholder="ANCV…" style={{ ...input, width: 100 }} />
                    </label>
                  </>
                )}
                <Btn type="button" icon="check" onClick={sell} disabled={busy || !sellTplId}>{busy ? '…' : 'Vendre'}</Btn>
              </div>
            </>
          )}
        </div>

        {/* tickets CE à rembourser */}
        <div style={card}>
          <div style={sectionTitle}>Tickets CE à rembourser ({vouchers.length})</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {vouchers.map((p) => (
              <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, fontFamily: th.fontUI, fontSize: 13, color: th.text, padding: '7px 0', borderTop: `1px solid ${th.line}` }}>
                <span style={{ flex: 1 }}>{paymentLabel(p)}</span>
                <span style={{ color: th.textMute }}>{p.voucherRef}{p.voucherIssuer ? ` · ${p.voucherIssuer}` : ''}</span>
                <b>{euro(p.amount)}</b>
                <button type="button" onClick={() => reimburse(p)} disabled={busy}
                  style={{ border: `1px solid ${th.line}`, background: 'transparent', color: th.text, borderRadius: 9, padding: '5px 10px', cursor: 'pointer', fontFamily: th.fontUI, fontSize: 12, fontWeight: 600 }}>
                  Remboursé
                </button>
              </div>
            ))}
            {vouchers.length === 0 && <div style={{ fontFamily: th.fontUI, fontSize: 13, color: th.textMute }}>Aucun ticket en attente.</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
