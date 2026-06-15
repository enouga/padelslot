'use client';
import { useEffect, useState, useCallback } from 'react';
import { api, ClubDetail, OpenMatch } from '@/lib/api';
import { useTheme } from '@/lib/ThemeProvider';
import { useAuth } from '@/lib/useAuth';
import { Screen } from '@/components/ui/Screen';
import { ClubNav } from '@/components/ClubNav';
import { Btn, Chip } from '@/components/ui/atoms';
import { Icon } from '@/components/ui/Icon';
import { Avatar } from '@/components/ui/Avatar';
import { colorForSeed } from '@/lib/playerColors';

const JOIN_ERRORS: Record<string, string> = {
  MATCH_FULL:            'Cette partie est complète.',
  MATCH_IN_PAST:         'Cette partie a déjà eu lieu.',
  MATCH_NOT_JOINABLE:    "Cette partie n'est plus ouverte.",
  ALREADY_JOINED:        'Vous participez déjà à cette partie.',
  ORGANIZER_CANNOT_LEAVE: "Vous organisez cette partie : annulez la réservation pour la retirer.",
  MEMBERSHIP_REQUIRED:   'Réservé aux membres du club.',
  MEMBERSHIP_BLOCKED:    'Votre accès au club est bloqué.',
  NOT_ORGANIZER:          "Seul l'organisateur peut retirer un joueur.",
  CANNOT_REMOVE_ORGANIZER: "L'organisateur ne peut pas être retiré.",
  PARTICIPANT_NOT_FOUND:  "Ce joueur n'est plus dans la partie.",
};

function formatWhen(iso: string, tz: string): string {
  return new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: tz })
    .format(new Date(iso)).replace(':', 'h');
}

// /parties — découverte des parties ouvertes (PUBLIC) du club : rejoindre / quitter.
export function OpenMatches({ club }: { club: ClubDetail }) {
  const { th } = useTheme();
  const { token, ready } = useAuth();
  const [matches, setMatches] = useState<OpenMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId]   = useState<string | null>(null);
  const [error, setError]     = useState('');

  const load = useCallback(async () => {
    if (!token) { setMatches([]); setLoading(false); return; }
    setLoading(true);
    try { setMatches(await api.getOpenMatches(club.slug, token)); }
    catch { setMatches([]); }
    finally { setLoading(false); }
  }, [club.slug, token]);

  useEffect(() => { if (ready) load(); }, [ready, load]);

  const act = async (m: OpenMatch, fn: () => Promise<unknown>) => {
    if (!token) return;
    setBusyId(m.id); setError('');
    try { await fn(); await load(); }
    catch (e) { setError(JOIN_ERRORS[(e as Error).message] ?? (e as Error).message); }
    finally { setBusyId(null); }
  };

  return (
    <Screen>
      <div style={{ paddingBottom: 40 }}>
        <ClubNav club={club} />
        <div style={{ padding: '18px 20px 0' }}>
          <h1 style={{ fontFamily: th.fontDisplay, fontWeight: 600, fontSize: 26, color: th.text, margin: 0, letterSpacing: -0.4 }}>Parties ouvertes</h1>
          <p style={{ fontFamily: th.fontUI, fontSize: 14, color: th.textMute, lineHeight: 1.5, margin: '8px 0 0' }}>
            Rejoignez la partie publique d&apos;un autre membre, ou créez la vôtre en choisissant « Partie ouverte » au moment de réserver.
          </p>
        </div>

        {error && (
          <div style={{ margin: '14px 20px 0', background: th.accent, color: th.onAccent, borderRadius: 12, padding: '10px 14px', fontFamily: th.fontUI, fontSize: 13.5, fontWeight: 600 }}>{error}</div>
        )}

        <div style={{ padding: '14px 20px 0', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {!ready || loading ? (
            <div style={{ padding: '24px 0', textAlign: 'center', fontFamily: th.fontUI, color: th.textFaint }}>Chargement…</div>
          ) : !token ? (
            <div style={{ padding: '24px 0', textAlign: 'center', fontFamily: th.fontUI, color: th.textMute }}>Connectez-vous pour voir les parties ouvertes.</div>
          ) : matches.length === 0 ? (
            <div style={{ padding: '24px 0', textAlign: 'center', fontFamily: th.fontUI, color: th.textMute }}>Aucune partie ouverte pour le moment.</div>
          ) : matches.map((m) => {
            const busy = busyId === m.id;
            return (
              <div key={m.id} style={{ background: th.surface, borderRadius: 16, padding: '14px 16px', boxShadow: `inset 0 0 0 1px ${th.line}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                  <Icon name="users" size={18} color={th.accent} />
                  <span style={{ fontFamily: th.fontUI, fontWeight: 700, fontSize: 15, color: th.text }}>{m.resourceName}</span>
                  <span style={{ marginLeft: 'auto' }}>
                    <Chip tone={m.full ? 'mute' : 'accent'}>{m.full ? 'Complet' : `${m.spotsLeft} place${m.spotsLeft > 1 ? 's' : ''}`}</Chip>
                  </span>
                </div>
                <div style={{ fontFamily: th.fontUI, fontSize: 13.5, color: th.textMute, marginBottom: 12 }}>
                  {formatWhen(m.startTime, club.timezone)} → {formatWhen(m.endTime, club.timezone)}
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, flexWrap: 'wrap' }}>
                    {m.players.map((p) => {
                      const c = colorForSeed(p.userId);
                      return (
                      <span key={p.userId} style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                        background: `${c}22`,
                        border: `1px solid ${c}`,
                        borderRadius: 999, padding: '4px 11px 4px 4px',
                        fontFamily: th.fontUI, fontSize: 13, fontWeight: 600, color: th.text,
                      }}>
                        <Avatar firstName={p.firstName} lastName={p.lastName} avatarUrl={p.avatarUrl} size={22} color={c} />
                        {p.firstName} {p.lastName}
                        {p.isOrganizer && <span style={{ fontSize: 10, fontWeight: 700, color: th.textMute, textTransform: 'uppercase', letterSpacing: 0.3 }}>orga</span>}
                        {m.viewerIsOrganizer && !p.isOrganizer && (
                          <button type="button" disabled={busy} aria-label={`Retirer ${p.firstName} ${p.lastName}`} title="Retirer ce joueur"
                            onClick={() => act(m, () => api.removeOpenMatchPlayer(club.slug, m.id, p.userId, token!))}
                            style={{ border: 'none', background: 'transparent', cursor: busy ? 'default' : 'pointer', color: th.textMute, fontSize: 15, lineHeight: 1, padding: 0, marginLeft: 2 }}>×</button>
                        )}
                      </span>
                      );
                    })}
                    {Array.from({ length: m.spotsLeft }).map((_, i) => (
                      <span key={`e${i}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, borderRadius: 999, padding: '4px 12px 4px 4px', border: `1.5px dashed ${th.lineStrong}`, fontFamily: th.fontUI, fontSize: 12.5, color: th.textFaint }}>
                        <span aria-hidden="true" style={{ width: 22, height: 22, borderRadius: '50%', flexShrink: 0, border: `1.5px dashed ${th.lineStrong}` }} />
                        Place libre
                      </span>
                    ))}
                  </div>
                  {m.viewerIsOrganizer ? (
                    <Chip tone="line" icon="check">Vous organisez</Chip>
                  ) : m.viewerIsParticipant ? (
                    <Btn variant="surface" disabled={busy} onClick={() => act(m, () => api.leaveOpenMatch(club.slug, m.id, token!))}>Quitter</Btn>
                  ) : (
                    <Btn icon="plus" disabled={busy || m.full} onClick={() => act(m, () => api.joinOpenMatch(club.slug, m.id, token!))}>Rejoindre</Btn>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Screen>
  );
}
