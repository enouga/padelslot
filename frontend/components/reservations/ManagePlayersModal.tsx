'use client';
import { useCallback, useEffect, useState } from 'react';
import { api, MyReservation, ReservationPlayers } from '@/lib/api';
import { useTheme } from '@/lib/ThemeProvider';
import { PartnerSearch } from '@/components/tournament/PartnerSearch';
import { Btn } from '@/components/ui/atoms';

const ERR: Record<string, string> = {
  PLAYER_CHANGE_TOO_LATE: 'Trop tard pour modifier les joueurs.',
  RESERVATION_NOT_ACTIVE: "Cette réservation n'est pas modifiable.",
  TOO_MANY_PLAYERS: 'La partie est complète.',
  MEMBER_NOT_FOUND: "Ce joueur n'est pas membre du club.",
  PARTNER_DUPLICATE: 'Ce joueur est déjà dans la partie.',
  CANNOT_REMOVE_ORGANIZER: "L'organisateur ne peut pas être retiré.",
  PARTICIPANT_NOT_FOUND: 'Joueur introuvable.',
  UNAUTHORIZED: "Seul l'organisateur peut modifier cette réservation.",
};
const msg = (e: string) => ERR[e] ?? e;

export function ManagePlayersModal({ reservation, token, canEdit, onClose, onChanged }: {
  reservation: MyReservation;
  token: string;
  canEdit: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { th } = useTheme();
  const [data, setData]       = useState<ReservationPlayers | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy]       = useState(false);
  const [error, setError]     = useState<string | null>(null);

  const apply = useCallback((next: ReservationPlayers) => { setData(next); onChanged(); }, [onChanged]);

  useEffect(() => {
    let alive = true;
    api.getReservationPlayers(reservation.id, token)
      .then((d) => { if (alive) setData(d); })
      .catch((e) => { if (alive) setError(msg((e as Error).message)); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [reservation.id, token]);

  const add = async (memberUserId: string) => {
    setBusy(true);
    try { setError(null); apply(await api.addReservationPlayer(reservation.id, memberUserId, token)); }
    catch (e) { setError(msg((e as Error).message)); }
    finally { setBusy(false); }
  };
  const remove = async (participantId: string) => {
    setBusy(true);
    try { setError(null); apply(await api.removeReservationPlayer(reservation.id, participantId, token)); }
    catch (e) { setError(msg((e as Error).message)); }
    finally { setBusy(false); }
  };

  const participants = data?.participants ?? [];
  const organizer    = participants.find((p) => p.isOrganizer);
  const others       = participants.filter((p) => !p.isOrganizer);
  const capacity     = data?.capacity ?? 0;
  const full         = capacity > 0 && participants.length >= capacity;
  const excludeIds   = participants.map((p) => p.userId);

  const rowStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: th.surface, borderRadius: 12, padding: '11px 14px', boxShadow: `inset 0 0 0 1px ${th.line}` };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', flexDirection: 'column', justifyContent: 'flex-start' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(2px)', animation: 'sp-fade .25s ease' }} />
      <div onClick={(e) => e.stopPropagation()} style={{ position: 'relative', width: '100%', maxWidth: 440, margin: '0 auto', background: th.bg, borderRadius: '0 0 22px 22px', padding: 20, boxShadow: '0 8px 30px rgba(0,0,0,0.3)', animation: 'sp-sheet-in-top .34s cubic-bezier(.2,.8,.2,1)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <span style={{ fontFamily: th.fontDisplay, fontWeight: 600, fontSize: 22, color: th.text }}>Joueurs de la partie</span>
          <button onClick={onClose} aria-label="Fermer" style={{ border: 'none', background: 'transparent', color: th.textMute, cursor: 'pointer', fontSize: 22, lineHeight: 1 }}>×</button>
        </div>
        <div style={{ fontFamily: th.fontUI, fontSize: 13, color: th.textMute, marginBottom: 16 }}>
          {reservation.resource.name} · {reservation.resource.club.name}
          {capacity > 0 && <> · {participants.length}/{capacity} joueurs</>}
        </div>

        {error && <div style={{ marginBottom: 12, background: th.accent, color: th.onAccent, borderRadius: 12, padding: '10px 13px', fontFamily: th.fontUI, fontSize: 13.5, fontWeight: 600 }}>{error}</div>}

        {loading ? (
          <div style={{ padding: '24px 0', textAlign: 'center', fontFamily: th.fontUI, color: th.textFaint }}>Chargement…</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {organizer && (
              <div style={rowStyle}>
                <span style={{ fontFamily: th.fontUI, fontSize: 14.5, color: th.text }}>{organizer.firstName} {organizer.lastName}</span>
                <span style={{ fontFamily: th.fontUI, fontSize: 12, color: th.textMute }}>Organisateur</span>
              </div>
            )}
            {others.map((p) => (
              <div key={p.id} style={rowStyle}>
                <span style={{ fontFamily: th.fontUI, fontSize: 14.5, color: th.text }}>{p.firstName} {p.lastName}</span>
                {canEdit && (
                  <button onClick={() => remove(p.id)} disabled={busy} style={{ border: `1px solid ${th.line}`, background: 'transparent', cursor: 'pointer', borderRadius: 9, padding: '4px 10px', fontFamily: th.fontUI, fontSize: 12.5, fontWeight: 600, color: '#ff7a4d' }}>Retirer</button>
                )}
              </div>
            ))}

            {!canEdit ? (
              <div style={{ marginTop: 8, fontFamily: th.fontUI, fontSize: 13, color: th.textMute }}>
                La modification des joueurs est fermée pour cette réservation.
              </div>
            ) : full ? (
              <div style={{ marginTop: 8, fontFamily: th.fontUI, fontSize: 13, color: th.textMute }}>La partie est complète.</div>
            ) : (
              <div style={{ marginTop: 10 }}>
                <span style={{ fontFamily: th.fontUI, fontSize: 12.5, fontWeight: 600, color: th.textMute, display: 'block', marginBottom: 7 }}>Ajouter un joueur</span>
                <PartnerSearch
                  slug={reservation.resource.club.slug}
                  token={token}
                  selected={null}
                  onSelect={(m) => add(m.id)}
                  onClear={() => {}}
                  disabled={busy}
                  excludeIds={excludeIds}
                  keepOpenOnSelect
                />
              </div>
            )}
          </div>
        )}
        <Btn variant="surface" full onClick={onClose} style={{ marginTop: 16 }}>Fermer</Btn>
      </div>
    </div>
  );
}
