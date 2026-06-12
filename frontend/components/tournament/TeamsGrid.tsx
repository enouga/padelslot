'use client';
import { TournamentParticipant } from '@/lib/api';
import { useTheme } from '@/lib/ThemeProvider';
import { ACCENTS } from '@/lib/theme';
import { Avatar } from '@/components/ui/Avatar';
import { Chip } from '@/components/ui/atoms';

// Grille publique des binômes inscrits : cartes avec avatars, section Confirmés
// puis Liste d'attente (position = ordre d'inscription garanti par le backend).
export function TeamsGrid({ participants, myRegId }: { participants: TournamentParticipant[] | null; myRegId?: string | null }) {
  const { th } = useTheme();

  if (participants === null) {
    return <div style={{ padding: '0 20px', fontFamily: th.fontUI, fontSize: 14, color: th.textFaint }}>Chargement…</div>;
  }
  if (participants.length === 0) {
    return (
      <div style={{ margin: '0 20px', background: th.surface, borderRadius: 14, padding: '18px', boxShadow: `inset 0 0 0 1px ${th.line}`, fontFamily: th.fontUI, fontSize: 14, color: th.textMute, textAlign: 'center' }}>
        Aucun inscrit pour le moment — soyez le premier binôme !
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
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 8 }}>
              {group.map((r, i) => <TeamCard key={r.id} team={r} index={i} mine={r.id === myRegId} />)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TeamCard({ team, index, mine }: { team: TournamentParticipant; index: number; mine: boolean }) {
  const { th } = useTheme();
  return (
    <div data-testid={`team-${team.id}`} style={{
      background: th.surface, borderRadius: 14, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 11,
      boxShadow: mine ? `inset 0 0 0 1.5px ${th.accent}` : `inset 0 0 0 1px ${th.line}`,
    }}>
      <div style={{ display: 'flex', flexShrink: 0 }}>
        <Avatar firstName={team.captain.firstName} lastName={team.captain.lastName} avatarUrl={team.captain.avatarUrl} />
        <div style={{ marginLeft: -10, borderRadius: '50%', boxShadow: `0 0 0 2px ${th.surface}` }}>
          <Avatar firstName={team.partner.firstName} lastName={team.partner.lastName} avatarUrl={team.partner.avatarUrl} />
        </div>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: th.fontUI, fontSize: 13.5, fontWeight: 700, color: th.text, lineHeight: 1.35 }}>
          {team.captain.firstName} {team.captain.lastName}
          <span style={{ color: th.textMute, fontWeight: 400 }}> &amp; </span>
          {team.partner.firstName} {team.partner.lastName}
        </div>
        {mine && <div style={{ fontFamily: th.fontUI, fontSize: 11.5, fontWeight: 700, color: th.accent, marginTop: 2 }}>Votre équipe</div>}
        {team.status === 'WAITLISTED' && (
          <div style={{ marginTop: 5 }}><Chip color={ACCENTS.apricot}>{`Attente · n°${index + 1}`}</Chip></div>
        )}
      </div>
      {team.status === 'CONFIRMED' && <span style={{ fontFamily: th.fontMono, fontSize: 12, color: th.textFaint, flexShrink: 0 }}>#{index + 1}</span>}
    </div>
  );
}
