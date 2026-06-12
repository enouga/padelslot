'use client';
import { EventParticipant } from '@/lib/api';
import { useTheme } from '@/lib/ThemeProvider';
import { ACCENTS } from '@/lib/theme';
import { Avatar } from '@/components/ui/Avatar';
import { Chip } from '@/components/ui/atoms';

// Grille publique des inscrits d'un event (inscription individuelle) :
// section Confirmés puis Liste d'attente (position = ordre d'inscription backend).
export function ParticipantsGrid({ participants, myRegId }: { participants: EventParticipant[] | null; myRegId?: string | null }) {
  const { th } = useTheme();

  if (participants === null) {
    return <div style={{ padding: '0 20px', fontFamily: th.fontUI, fontSize: 14, color: th.textFaint }}>Chargement…</div>;
  }
  if (participants.length === 0) {
    return (
      <div style={{ margin: '0 20px', background: th.surface, borderRadius: 14, padding: '18px', boxShadow: `inset 0 0 0 1px ${th.line}`, fontFamily: th.fontUI, fontSize: 14, color: th.textMute, textAlign: 'center' }}>
        Aucun inscrit pour le moment — lancez-vous !
      </div>
    );
  }

  return (
    <div style={{ padding: '0 20px' }}>
      {(['CONFIRMED', 'WAITLISTED'] as const).map((st) => {
        const group = participants.filter((p) => p.status === st);
        if (group.length === 0) return null;
        return (
          <div key={st} style={{ marginBottom: 18 }}>
            <div style={{ fontFamily: th.fontUI, fontSize: 12.5, fontWeight: 700, letterSpacing: 0.3, textTransform: 'uppercase', color: th.textMute, marginBottom: 10 }}>
              {st === 'CONFIRMED' ? 'Confirmés' : "Liste d'attente"} ({group.length})
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8 }}>
              {group.map((r, i) => <ParticipantCard key={r.id} reg={r} index={i} mine={r.id === myRegId} />)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ParticipantCard({ reg, index, mine }: { reg: EventParticipant; index: number; mine: boolean }) {
  const { th } = useTheme();
  return (
    <div data-testid={`participant-${reg.id}`} style={{
      background: th.surface, borderRadius: 14, padding: '11px 13px', display: 'flex', alignItems: 'center', gap: 10,
      boxShadow: mine ? `inset 0 0 0 1.5px ${th.accent}` : `inset 0 0 0 1px ${th.line}`,
    }}>
      <Avatar firstName={reg.user.firstName} lastName={reg.user.lastName} avatarUrl={reg.user.avatarUrl} size={32} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: th.fontUI, fontSize: 13.5, fontWeight: 700, color: th.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {reg.user.firstName} {reg.user.lastName}
        </div>
        {mine && <div style={{ fontFamily: th.fontUI, fontSize: 11.5, fontWeight: 700, color: th.accent, marginTop: 1 }}>Vous</div>}
        {reg.status === 'WAITLISTED' && (
          <div style={{ marginTop: 4 }}><Chip color={ACCENTS.apricot}>{`Attente · n°${index + 1}`}</Chip></div>
        )}
      </div>
      {reg.status === 'CONFIRMED' && <span style={{ fontFamily: th.fontMono, fontSize: 12, color: th.textFaint, flexShrink: 0 }}>#{index + 1}</span>}
    </div>
  );
}
