'use client';
import { useState, useEffect } from 'react';
import { api, TimeSlot, Reservation, MemberPackage, ClubMemberSearchResult } from '@/lib/api';
import { packageLabel, canCover } from '@/lib/packages';
import { useTheme } from '@/lib/ThemeProvider';
import { durationLabel } from '@/lib/duration';
import { Btn, Segmented } from '@/components/ui/atoms';
import { Avatar } from '@/components/ui/Avatar';
import { colorForSeed } from '@/lib/playerColors';
import { PartnerSearch } from '@/components/tournament/PartnerSearch';
import { Icon } from '@/components/ui/Icon';

interface BookingModalProps {
  slot: TimeSlot;
  resourceId: string;
  price: string;
  duration: number;
  token: string;
  timezone?: string;
  /** Slug du club — active l'ajout de partenaires (annuaire des membres). */
  slug?: string;
  /** Nombre max de joueurs du terrain (single = 2, double = 4) — plafonne les partenaires. */
  maxPlayers?: number;
  /** Soldes prépayés utilisables du joueur sur ce club (option « payer avec mon carnet »). */
  packages?: MemberPackage[];
  onClose: () => void;
  onConfirmed: (reservation: Reservation) => void;
}

const HOLD_SECONDS = 600;

function formatHour(iso: string, tz = 'Europe/Paris'): string {
  return new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: tz })
    .format(new Date(iso)).replace(':', 'h');
}

function ProgressRing({ frac, size = 132 }: { frac: number; size?: number }) {
  const { th } = useTheme();
  const r = (size - 12) / 2;
  const C = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={th.surface2} strokeWidth="6" />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={th.accent} strokeWidth="6" strokeLinecap="round"
        strokeDasharray={C} strokeDashoffset={C * (1 - frac)} style={{ transition: 'stroke-dashoffset 1s linear' }} />
    </svg>
  );
}

const BOOKING_ERRORS: Record<string, string> = {
  SLOT_NOT_AVAILABLE:     "Ce créneau vient d'être pris. Choisissez-en un autre.",
  SLOT_ALREADY_HELD:      "Ce créneau vient d'être pris. Choisissez-en un autre.",
  QUOTA_PEAK_REACHED:     'Vous avez atteint votre nombre maximum de réservations en heures pleines.',
  QUOTA_OFFPEAK_REACHED:  'Vous avez atteint votre nombre maximum de réservations en heures creuses.',
  TOO_MANY_PLAYERS:       'Trop de joueurs pour ce terrain.',
  PARTNER_NOT_MEMBER:     "Un partenaire n'est pas membre du club.",
  PARTNER_DUPLICATE:      'Un partenaire figure en double.',
};

export default function BookingModal({
  slot, resourceId, price, duration, token, timezone, slug, maxPlayers, packages = [], onClose, onConfirmed,
}: BookingModalProps) {
  const { th } = useTheme();
  const [phase, setPhase]             = useState<'confirm' | 'pending' | 'error'>('confirm');
  const [reservation, setReservation] = useState<Reservation | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(HOLD_SECONDS);
  const [errorMsg, setErrorMsg]       = useState('');
  const [paySource, setPaySource]     = useState<string | null>(null); // id du package choisi, null = régler au club
  const [partners, setPartners]       = useState<ClubMemberSearchResult[]>([]);
  const [visibility, setVisibility]   = useState<'PRIVATE' | 'PUBLIC'>('PRIVATE');

  // Multi-joueurs : ajout de partenaires + partie publique/privée.
  const cap = maxPlayers ?? 1;
  const showPartners = !!slug && cap > 1;
  const nbPlayers = 1 + partners.length;
  const atCap = nbPlayers >= cap;
  const spotsLeft = Math.max(0, cap - nbPlayers);
  const euros = (cents: number) => (cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2).replace('.', ','));

  // Prix du créneau calculé par le backend (slot.price : tarif creux ssi
  // entièrement en heures creuses) ; repli sur le prix du terrain.
  const totalCents = Math.round(Number(slot.price ?? price) * 100);
  const totalEuros = totalCents / 100;
  const totalPrice = totalCents % 100 === 0 ? String(totalCents / 100) : (totalCents / 100).toFixed(2).replace('.', ',');
  const perPlayer = euros(Math.floor(totalCents / nbPlayers));
  const durLabel = durationLabel(duration);

  useEffect(() => {
    if (phase !== 'pending') return;
    if (secondsLeft <= 0) {
      setPhase('error');
      setErrorMsg('La pré-réservation a expiré. Veuillez recommencer.');
      return;
    }
    const t = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [phase, secondsLeft]);

  const handleHold = async () => {
    try {
      const res = await api.holdSlot({
        resourceId, startTime: slot.startTime, endTime: slot.endTime,
        ...(showPartners ? { partnerUserIds: partners.map((p) => p.id), visibility } : {}),
      }, token);
      setReservation(res);
      setSecondsLeft(HOLD_SECONDS);
      setPhase('pending');
    } catch (err) {
      setPhase('error');
      setErrorMsg(BOOKING_ERRORS[(err as Error).message] ?? (err as Error).message);
    }
  };

  const handleConfirm = async () => {
    if (!reservation) return;
    try {
      const confirmed = await api.confirmReservation(
        reservation.id, token,
        paySource ? { packageId: paySource } : undefined,
      );
      onConfirmed(confirmed);
    } catch (err) {
      const msg = (err as Error).message;
      if (msg === 'INSUFFICIENT_BALANCE') {
        // La résa reste PENDING : on retire l'option et on laisse confirmer autrement.
        setPaySource(null);
        setErrorMsg('Solde insuffisant — réglez au club.');
        return;
      }
      setPhase('error');
      setErrorMsg(msg === 'SLOT_NO_LONGER_AVAILABLE' ? 'Ce créneau a été pris entre-temps. Veuillez recommencer.' : msg);
    }
  };

  const handleClose = async () => {
    if (phase === 'pending' && reservation) {
      try { await api.cancelReservation(reservation.id, token); } catch { /* cleanup job récupèrera */ }
    }
    onClose();
  };

  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, '0');
  const ss = String(secondsLeft % 60).padStart(2, '0');

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 90, display: 'flex', flexDirection: 'column', justifyContent: 'flex-start' }}>
      <div onClick={handleClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(2px)', animation: 'sp-fade .25s ease' }} />
      <div style={{ position: 'relative', width: '100%', maxWidth: 480, margin: '0 auto', background: th.bgElev, borderRadius: '0 0 28px 28px', padding: '12px 20px 36px', boxShadow: '0 10px 40px rgba(0,0,0,0.3)', animation: 'sp-sheet-in-top .34s cubic-bezier(.2,.8,.2,1)' }}>
        {phase === 'confirm' && (
          <>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
              <span style={{ fontFamily: th.fontDisplay, fontWeight: 600, fontSize: 52, lineHeight: 1, color: th.text, letterSpacing: -1 }}>{totalPrice}€</span>
              <span style={{ fontFamily: th.fontUI, fontSize: 14, color: th.textMute }}>{durLabel}{slot.offPeak ? ' · heures creuses' : ''}</span>
            </div>
            <div style={{ background: th.surface2, borderRadius: 16, padding: '4px 16px', marginTop: 18 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '13px 0' }}>
                <span style={{ fontFamily: th.fontUI, fontSize: 14, color: th.textMute }}>Horaire</span>
                <span style={{ fontFamily: th.fontUI, fontSize: 14.5, fontWeight: 600, color: th.text }}>{formatHour(slot.startTime, timezone)} → {formatHour(slot.endTime, timezone)}</span>
              </div>
            </div>

            {showPartners && (
              <div style={{ marginTop: 18 }}>
                <div style={{ fontFamily: th.fontUI, fontSize: 12.5, fontWeight: 600, color: th.textMute, marginBottom: 8 }}>
                  Partenaires <span style={{ color: th.textFaint, fontWeight: 500 }}>· membres du club</span>
                </div>
                {partners.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                    {partners.map((p) => {
                      const c = colorForSeed(p.id);
                      return (
                      <span key={p.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: `${c}22`, border: `1px solid ${c}`, borderRadius: 999, padding: '4px 10px 4px 4px' }}>
                        <Avatar firstName={p.firstName} lastName={p.lastName} avatarUrl={null} size={24} color={c} />
                        <span style={{ fontFamily: th.fontUI, fontSize: 13, color: th.text }}>{p.firstName} {p.lastName}</span>
                        <button type="button" onClick={() => setPartners((xs) => xs.filter((x) => x.id !== p.id))} aria-label={`Retirer ${p.firstName} ${p.lastName}`}
                          style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: th.textMute, fontSize: 17, lineHeight: 1, padding: 0 }}>×</button>
                      </span>
                      );
                    })}
                  </div>
                )}
                {atCap ? (
                  <div style={{ fontFamily: th.fontUI, fontSize: 12, color: th.textFaint }}>Terrain complet ({cap} joueurs).</div>
                ) : (
                  <PartnerSearch slug={slug!} token={token} selected={null}
                    excludeIds={partners.map((p) => p.id)} keepOpenOnSelect
                    onSelect={(m) => setPartners((xs) => (xs.some((x) => x.id === m.id) ? xs : [...xs, m]))}
                    onClear={() => {}} />
                )}

                <div style={{ marginTop: 14 }}>
                  <Segmented<'PRIVATE' | 'PUBLIC'> value={visibility} onChange={setVisibility}
                    options={[{ value: 'PRIVATE', label: 'Partie privée' }, { value: 'PUBLIC', label: 'Partie ouverte' }]} />
                  <div style={{ fontFamily: th.fontUI, fontSize: 11.5, color: th.textFaint, marginTop: 6, lineHeight: 1.4 }}>
                    {visibility === 'PUBLIC'
                      ? `Visible par les membres du club, qui peuvent rejoindre (${spotsLeft} place${spotsLeft > 1 ? 's' : ''} restante${spotsLeft > 1 ? 's' : ''}).`
                      : 'Visible uniquement par vous et vos partenaires.'}
                  </div>
                </div>

                {nbPlayers > 1 && (
                  <div style={{ marginTop: 12, fontFamily: th.fontUI, fontSize: 13, fontWeight: 600, color: th.text }}>
                    ≈ {perPlayer} € par joueur ({nbPlayers} joueurs)
                  </div>
                )}
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '16px 2px', color: th.textMute }}>
              <Icon name="clock" size={15} color={th.textMute} />
              <span style={{ fontFamily: th.fontUI, fontSize: 12.5, lineHeight: 1.4 }}>
                Le créneau sera bloqué <b style={{ color: th.text }}>10 minutes</b> le temps de confirmer.
              </span>
            </div>
            <div style={{ display: 'flex', gap: 11 }}>
              <Btn variant="surface" onClick={handleClose} style={{ flex: '0 0 38%' }}>Annuler</Btn>
              <Btn icon="lock" onClick={handleHold} style={{ flex: 1 }}>Pré-réserver</Btn>
            </div>
          </>
        )}

        {phase === 'pending' && (
          <>
            <div style={{ position: 'relative', width: 132, height: 132, margin: '6px auto 4px' }}>
              <ProgressRing frac={secondsLeft / HOLD_SECONDS} />
              <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontFamily: th.fontMono, fontWeight: 700, fontSize: 30, color: th.text, letterSpacing: -1 }}>{mm}:{ss}</span>
                <span style={{ fontFamily: th.fontUI, fontSize: 10.5, letterSpacing: 0.5, textTransform: 'uppercase', color: th.textMute, marginTop: 2 }}>Confirmez dans</span>
              </div>
            </div>
            <div style={{ textAlign: 'center', fontFamily: th.fontDisplay, fontWeight: 600, fontSize: 26, color: th.text, letterSpacing: -0.3 }}>Créneau bloqué pour vous</div>
            <div style={{ textAlign: 'center', fontFamily: th.fontUI, fontSize: 13.5, color: th.textMute, marginTop: 6 }}>{formatHour(slot.startTime, timezone)} → {formatHour(slot.endTime, timezone)} · {totalPrice}€</div>
            {(packages.length > 0 || errorMsg) && (
              <div style={{ marginTop: 16 }}>
                {errorMsg && (
                  <div style={{ fontFamily: th.fontUI, fontSize: 12.5, color: th.onAccent, background: th.accent, padding: '8px 12px', borderRadius: 10, fontWeight: 600, marginBottom: 10 }}>{errorMsg}</div>
                )}
                {packages.length > 0 && (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
                    <button type="button" onClick={() => setPaySource(null)}
                      style={{ border: `1.5px solid ${paySource === null ? th.accent : th.lineStrong}`, background: paySource === null ? th.surface2 : 'transparent', borderRadius: 10, padding: '7px 12px', cursor: 'pointer', fontFamily: th.fontUI, fontSize: 12.5, fontWeight: 600, color: th.text }}>
                      Régler au club
                    </button>
                    {packages.map((p) => {
                      const ok = canCover(p, totalEuros);
                      return (
                        <button key={p.id} type="button" disabled={!ok} onClick={() => setPaySource(p.id)}
                          style={{ border: `1.5px solid ${paySource === p.id ? th.accent : th.lineStrong}`, background: paySource === p.id ? th.surface2 : 'transparent', borderRadius: 10, padding: '7px 12px', cursor: ok ? 'pointer' : 'default', opacity: ok ? 1 : 0.5, fontFamily: th.fontUI, fontSize: 12.5, fontWeight: 600, color: th.text }}>
                          {packageLabel(p)}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
            <div style={{ display: 'flex', gap: 11, marginTop: 22 }}>
              <Btn variant="surface" onClick={handleClose} style={{ flex: '0 0 38%' }}>Abandonner</Btn>
              <Btn icon="arrowR" onClick={handleConfirm} style={{ flex: 1 }}>{paySource ? 'Confirmer avec mon solde' : 'Confirmer et payer'}</Btn>
            </div>
          </>
        )}

        {phase === 'error' && (
          <>
            <div style={{ fontFamily: th.fontUI, fontSize: 14, color: th.onAccent, background: th.accent, padding: '12px 14px', borderRadius: 12, fontWeight: 600 }}>{errorMsg}</div>
            <div style={{ marginTop: 14 }}>
              <Btn full variant="surface" onClick={onClose}>Fermer</Btn>
            </div>
          </>
        )}

        <div style={{ width: 38, height: 5, borderRadius: 3, background: th.lineStrong, margin: '18px auto 0' }} />
      </div>
    </div>
  );
}
