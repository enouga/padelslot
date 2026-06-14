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
  const ring = { borderRadius: '50%', boxShadow: `0 0 0 2px ${mine ? th.bgElev : th.surface}` } as const;
  const badges = (mine ? 1 : 0) + (team.status === 'WAITLISTED' ? 1 : 0);
  return (
    <div data-testid={`team-${team.id}`} style={{
      background: mine ? `${th.accent}12` : th.surface, borderRadius: 16, padding: '13px 15px', display: 'flex', alignItems: 'center', gap: 13,
      boxShadow: mine ? `inset 0 0 0 1.5px ${th.accent}` : `inset 0 0 0 1px ${th.line}`,
    }}>
      <div style={{ display: 'flex', flexShrink: 0 }}>
        <div style={ring}><Avatar firstName={team.captain.firstName} lastName={team.captain.lastName} avatarUrl={team.captain.avatarUrl} /></div>
        <div style={{ ...ring, marginLeft: -11 }}><Avatar firstName={team.partner.firstName} lastName={team.partner.lastName} avatarUrl={team.partner.avatarUrl} /></div>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: th.fontUI, fontSize: 14, fontWeight: 600, color: th.text, lineHeight: 1.3 }}>
          {team.captain.firstName} {team.captain.lastName}
          <span style={{ color: th.textFaint, fontWeight: 400 }}> &amp; </span>
          {team.partner.firstName} {team.partner.lastName}
        </div>
        {badges > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
            {mine && <Chip color={th.accent}>Votre équipe</Chip>}
            {team.status === 'WAITLISTED' && <Chip color={ACCENTS.apricot}>{`Attente · n°${index + 1}`}</Chip>}
          </div>
        )}
      </div>
      {team.status === 'CONFIRMED' && (
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
