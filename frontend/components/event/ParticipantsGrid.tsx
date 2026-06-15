'use client';
import { EventParticipant } from '@/lib/api';
import { useTheme } from '@/lib/ThemeProvider';
import { ACCENTS } from '@/lib/theme';
import { Avatar } from '@/components/ui/Avatar';
import { Chip } from '@/components/ui/atoms';
import { colorForSeed } from '@/lib/playerColors';

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
  const c = colorForSeed(reg.id);
  const badges = (mine ? 1 : 0) + (reg.status === 'WAITLISTED' ? 1 : 0);
  return (
    <div data-testid={`participant-${reg.id}`} style={{
      background: mine ? `${th.accent}12` : th.surface, borderRadius: 16, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12,
      boxShadow: mine ? `inset 0 0 0 1.5px ${th.accent}` : `inset 0 0 0 1px ${th.line}`,
      borderLeft: `4px solid ${c}`,
    }}>
      <div style={{ flexShrink: 0, borderRadius: '50%', boxShadow: `0 0 0 2px ${mine ? th.bgElev : th.surface}` }}>
        <Avatar firstName={reg.user.firstName} lastName={reg.user.lastName} avatarUrl={reg.user.avatarUrl} size={34} color={c} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: th.fontUI, fontSize: 14, fontWeight: 600, color: th.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {reg.user.firstName} {reg.user.lastName}
        </div>
        {badges > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
            {mine && <Chip color={th.accent}>Vous</Chip>}
            {reg.status === 'WAITLISTED' && <Chip color={ACCENTS.apricot}>{`Attente · n°${index + 1}`}</Chip>}
          </div>
        )}
      </div>
      {reg.status === 'CONFIRMED' && (
        <span aria-label={`Position ${index + 1}`} style={{
          flexShrink: 0, width: 28, height: 28, borderRadius: '50%',
          background: mine ? th.accent : th.surface2, color: mine ? th.onAccent : th.textMute,
          fontFamily: th.fontMono, fontSize: 12.5, fontWeight: 700,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>{index + 1}</span>
      )}
    </div>
  );
}
