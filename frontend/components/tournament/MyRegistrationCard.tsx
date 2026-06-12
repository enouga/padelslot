'use client';
import { MyTournamentRegistration } from '@/lib/api';
import { useTheme } from '@/lib/ThemeProvider';
import { ACCENTS } from '@/lib/theme';
import { Chip } from '@/components/ui/atoms';
import { PartnerSearch } from './PartnerSearch';

// Carte « mon inscription » : binôme, statut (+ position en liste d'attente),
// changement de coéquipier et désinscription tant que les inscriptions sont ouvertes.
export function MyRegistrationCard({ myReg, profileId, closed, busy, waitlistPos, slug, token, partner, onSelectPartner, onClearPartner, onChangePartner, onCancel }: {
  myReg: MyTournamentRegistration;
  profileId: string | undefined;
  closed: boolean;
  busy: boolean;
  waitlistPos: number | null;
  slug: string;
  token: string;
  partner: { id: string; firstName: string; lastName: string } | null;
  onSelectPartner: (m: { id: string; firstName: string; lastName: string }) => void;
  onClearPartner: () => void;
  onChangePartner: () => void;
  onCancel: () => void;
}) {
  const { th } = useTheme();
  const primaryBtn: React.CSSProperties = { border: 'none', cursor: 'pointer', background: th.accent, color: th.onAccent, borderRadius: 11, padding: '12px 16px', fontFamily: th.fontUI, fontWeight: 700, fontSize: 14.5, opacity: busy ? 0.6 : 1 };

  return (
    <div style={{ background: th.surface, borderRadius: 16, padding: '16px 18px', boxShadow: `inset 0 0 0 1px ${th.line}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {myReg.status === 'CONFIRMED'
          ? <Chip tone="accent" icon="check">Inscrit</Chip>
          : <Chip color={ACCENTS.apricot} icon="clock">{waitlistPos != null ? `Liste d'attente · position n°${waitlistPos}` : "Liste d'attente"}</Chip>}
      </div>
      <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {[
          { p: myReg.captain, lic: myReg.captainLicense, role: 'Capitaine' },
          { p: myReg.partner, lic: myReg.partnerLicense, role: 'Coéquipier' },
        ].map(({ p, lic, role }) => (
          <div key={p.id} style={{ background: th.surface2, borderRadius: 11, padding: '10px 13px' }}>
            <div style={{ fontFamily: th.fontUI, fontSize: 14, fontWeight: 700, color: th.text }}>
              {p.firstName} {p.lastName}
              <span style={{ color: th.textMute, fontWeight: 400, fontSize: 12 }}> · {role}</span>
            </div>
            <div style={{ fontFamily: th.fontUI, fontSize: 13, color: th.textMute, marginTop: 3 }}>
              Licence {lic ?? '—'}{p.id === profileId ? ` · ${p.phone ?? '—'}` : ''}
            </div>
          </div>
        ))}
      </div>
      {!closed ? (
        <>
          <div style={{ fontFamily: th.fontUI, fontSize: 12.5, color: th.textMute, marginTop: 16, marginBottom: 6 }}>Changer de coéquipier</div>
          <PartnerSearch key="change-partner-search" slug={slug} token={token} selected={partner} onSelect={onSelectPartner} onClear={onClearPartner} disabled={busy} />
          <button onClick={onChangePartner} disabled={busy || !partner} style={{ ...primaryBtn, marginTop: 8 }}>Changer de coéquipier</button>
          <button onClick={onCancel} disabled={busy} style={{ marginTop: 12, marginLeft: 10, border: `1px solid ${th.line}`, background: 'transparent', color: th.textMute, cursor: 'pointer', borderRadius: 11, padding: '10px 14px', fontFamily: th.fontUI, fontSize: 13.5 }}>Se désinscrire</button>
        </>
      ) : (
        <div style={{ fontFamily: th.fontUI, fontSize: 13, color: th.textFaint, marginTop: 12 }}>Inscriptions closes : modification et annulation ne sont plus possibles.</div>
      )}
    </div>
  );
}
