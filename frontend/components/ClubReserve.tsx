'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, ClubDetail, ClubAvailability, TimeSlot, MyReservation, MemberPackage } from '@/lib/api';
import { packageLabel } from '@/lib/packages';
import { useTheme } from '@/lib/ThemeProvider';
import { useAuth } from '@/lib/useAuth';
import { inkOn } from '@/lib/theme';
import { dayKeyInTz } from '@/lib/calendar';
import { courtType, courtFormat, SINGLE_COLOR } from '@/lib/courtType';
import { effectiveDurations, defaultDuration, durationLabel } from '@/lib/duration';
import { Screen } from '@/components/ui/Screen';
import { Chip, Placeholder, Segmented } from '@/components/ui/atoms';
import { Icon } from '@/components/ui/Icon';
import BookingModal from '@/components/BookingModal';
import DateSelector from '@/components/DateSelector';
import { ClubNav } from '@/components/ClubNav';

function todayISO(): string { return new Date().toISOString().slice(0, 10); }

function nextDays(count: number) {
  const out: { key: string; dow: string; day: string }[] = [];
  const base = new Date();
  for (let i = 0; i < count; i++) {
    const d = new Date(base); d.setDate(base.getDate() + i);
    out.push({
      key: d.toISOString().slice(0, 10),
      dow: new Intl.DateTimeFormat('fr-FR', { weekday: 'short' }).format(d).replace('.', ''),
      day: new Intl.DateTimeFormat('fr-FR', { day: 'numeric' }).format(d),
    });
  }
  return out;
}

function formatHour(iso: string, tz: string): string {
  return new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: tz }).format(new Date(iso)).replace(':', 'h');
}

// Expérience de réservation du club — rendue sur /reserver (la racine du sous-domaine affiche le Club-house).
// Coiffée par la barre de nav club (ClubNav) ; onglet interne « réserver » / « terrains ».
export function ClubReserve({ club }: { club: ClubDetail }) {
  const { th } = useTheme();
  const router = useRouter();
  const { token } = useAuth();
  const allDurations = Array.from(new Set(
    club.clubSports.flatMap((cs) => effectiveDurations(cs.durationsMin, cs.sport.defaultDurationsMin)),
  )).sort((a, b) => a - b);
  const [tab, setTab]           = useState<'book' | 'courts'>('book');
  const [date, setDate]         = useState(todayISO());
  const [duration, setDuration] = useState<number>(defaultDuration(allDurations));
  const [avail, setAvail]       = useState<ClubAvailability[]>([]);
  const [loadingA, setLoadingA] = useState(true);
  const [booking, setBooking]   = useState<{ resourceId: string; price: string; slot: TimeSlot } | null>(null);
  const [confirmed, setConfirmed] = useState<false | 'booked' | 'moved'>(false);
  const [isSub, setIsSub]       = useState(false);
  // Lien profond depuis le Club-house : ?resource=<id>&start=<ISO> pré-ouvre la confirmation.
  const [deepSlot, setDeepSlot] = useState<{ resourceId: string; start: string } | null>(null);
  // Mode déplacement (?move=<id> depuis le calendrier de Mes réservations).
  const [moveId, setMoveId]   = useState<string | null>(null);
  const [moveRes, setMoveRes] = useState<MyReservation | null>(null);
  // Soldes prépayés du joueur sur ce club (chips + option de paiement à la confirmation).
  const [myPackages, setMyPackages] = useState<MemberPackage[]>([]);

  const windowDays = (isSub ? club.memberBookingDays : club.publicBookingDays);
  const days = nextDays(Math.max(1, windowDays + 1));

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (p.get('tab') === 'courts') setTab('courts');
    const resource = p.get('resource'); const start = p.get('start');
    if (resource && start && !isNaN(new Date(start).getTime())) {
      setDeepSlot({ resourceId: resource, start });
      setDate(start.slice(0, 10));
    }
    const move = p.get('move');
    if (move) setMoveId(move);
  }, []);

  // Charge la résa à déplacer : doit être à soi, de CE club, à venir et active —
  // sinon le paramètre est ignoré silencieusement (page normale).
  useEffect(() => {
    if (!moveId || !token) return;
    api.getMyReservations(token).then((list) => {
      const r = list.find((x) => x.id === moveId);
      if (!r || r.status === 'CANCELLED' || r.resource.club.slug !== club.slug
          || new Date(r.startTime).getTime() <= Date.now()) return;
      setMoveRes(r);
      setDate(dayKeyInTz(r.startTime, club.timezone));
      const dur = Math.round((new Date(r.endTime).getTime() - new Date(r.startTime).getTime()) / 60_000);
      if (allDurations.includes(dur)) setDuration(dur);
    }).catch(() => {});
    // allDurations est dérivé de `club` (stable pour un rendu donné)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moveId, token, club.slug, club.timezone]);

  const abandonMove = () => {
    setMoveRes(null);
    setMoveId(null);
    router.replace('/reserver');
  };

  // Statut d'abonné en lecture seule : l'abonnement est attribué par le club
  // (back-office). Sert à connaître la fenêtre de réservation du joueur.
  useEffect(() => {
    if (!token) { setIsSub(false); return; }
    api.getMyMemberships(token).then((ms) => setIsSub(ms.some((m) => m.clubId === club.id && m.isSubscriber))).catch(() => {});
  }, [token, club.id]);

  useEffect(() => {
    if (!token) { setMyPackages([]); return; }
    api.getMyClubPackages(club.slug, token).then(setMyPackages).catch(() => setMyPackages([]));
  }, [token, club.slug]);

  const loadAvail = useCallback(async () => {
    setLoadingA(true);
    try { setAvail(await api.getClubAvailability(club.slug, date, duration)); }
    catch { setAvail([]); }
    finally { setLoadingA(false); }
  }, [club.slug, date, duration]);

  useEffect(() => { if (tab === 'book') loadAvail(); }, [tab, loadAvail]);

  // Consomme le lien profond une fois les dispos chargées : créneau encore libre → pré-ouvre,
  // sinon (pris entre-temps) la page normale s'affiche, sans erreur.
  useEffect(() => {
    if (!deepSlot || loadingA || !token) return;
    const res = avail.find((a) => a.resource.id === deepSlot.resourceId);
    const slot = res?.slots.find((s) => s.startTime === deepSlot.start && s.available);
    if (res && slot) setBooking({ resourceId: res.resource.id, price: slot.pricePerHour, slot });
    setDeepSlot(null);
  }, [deepSlot, loadingA, avail, token]);

  const onSlot = (resourceId: string, price: string, slot: TimeSlot) => {
    if (!token) { router.push('/login'); return; }
    setBooking({ resourceId, price, slot });
  };

  // Regroupe les terrains (avec dispos) par sport.
  const bySport = new Map<string, ClubAvailability[]>();
  for (const a of avail) {
    const k = a.resource.sport.name;
    if (!bySport.has(k)) bySport.set(k, []);
    bySport.get(k)!.push(a);
  }

  return (
    <Screen>
      <div style={{ paddingBottom: 40 }}>
        <ClubNav club={club} />
        {club.description && (
          <p style={{ fontFamily: th.fontUI, fontSize: 14.5, color: th.textMute, lineHeight: 1.5, margin: '16px 20px 0' }}>{club.description}</p>
        )}

        {myPackages.length > 0 && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '14px 20px 0' }}>
            {myPackages.map((p) => (
              <Chip key={p.id}>{packageLabel(p)}</Chip>
            ))}
          </div>
        )}

        {confirmed && (
          <div style={{ margin: '14px 20px 0', display: 'flex', alignItems: 'center', gap: 10, background: th.accent, color: th.onAccent, borderRadius: 14, padding: '12px 14px' }}>
            <Icon name="check" size={18} color={th.onAccent} stroke={2.4} />
            <span style={{ fontFamily: th.fontUI, fontSize: 14, fontWeight: 600 }}>
              {confirmed === 'moved' ? 'Réservation déplacée !' : 'Réservation confirmée !'}
            </span>
          </div>
        )}

        {moveRes && (
          <div style={{ margin: '14px 20px 0', display: 'flex', alignItems: 'center', gap: 10, background: th.accentWarm, color: inkOn(th.accentWarm), borderRadius: 14, padding: '12px 14px' }}>
            <span style={{ flex: 1, fontFamily: th.fontUI, fontSize: 13.5, fontWeight: 600, lineHeight: 1.4 }}>
              ↔ Déplacement de votre réservation — {moveRes.resource.name} ·{' '}
              {new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', timeZone: club.timezone }).format(new Date(moveRes.startTime))} ·{' '}
              {formatHour(moveRes.startTime, club.timezone)}. Choisissez le nouveau créneau.
            </span>
            <button onClick={abandonMove}
              style={{ border: 'none', cursor: 'pointer', borderRadius: 10, padding: '7px 12px', background: 'rgba(0,0,0,0.18)', color: inkOn(th.accentWarm), fontFamily: th.fontUI, fontSize: 12.5, fontWeight: 700, whiteSpace: 'nowrap', flexShrink: 0 }}>
              Abandonner
            </button>
          </div>
        )}

        {tab === 'book' ? (
          <>
            {/* sélecteur de dates — bande défilante (cellules confortables, swipe horizontal) */}
            <div style={{ padding: '18px 20px 4px' }}>
              <DateSelector value={date} onChange={setDate} days={7} maxKey={days[days.length - 1]?.key} />
            </div>
            {allDurations.length > 1 && (
              <div style={{ padding: '14px 20px 0' }}>
                <Segmented<number> value={duration} onChange={setDuration} options={allDurations.map((d) => ({ value: d, label: durationLabel(d) }))} />
              </div>
            )}

            {/* grille : par sport, chaque terrain + ses créneaux libres */}
            <div style={{ padding: '8px 20px 0' }}>
              {loadingA && avail.length === 0 ? (
                <div style={{ padding: '30px 0', textAlign: 'center', fontFamily: th.fontUI, color: th.textFaint }}>Chargement…</div>
              ) : avail.length === 0 ? (
                <div style={{ padding: '24px 0', textAlign: 'center', fontFamily: th.fontUI, color: th.textMute }}>Aucun terrain.</div>
              ) : (
                <div style={{ opacity: loadingA ? 0.55 : 1, transition: 'opacity .15s' }}>
                {[...bySport.entries()].map(([sportName, items]) => (
                  <div key={sportName} style={{ marginTop: 14 }}>
                    <div style={{ fontFamily: th.fontUI, fontWeight: 700, fontSize: 13, letterSpacing: 0.4, textTransform: 'uppercase', color: th.textMute, marginBottom: 10 }}>{sportName}</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      {items.map(({ resource, slots }) => {
                        const ct = courtType(typeof resource.attributes?.surface === 'string' ? resource.attributes.surface : undefined);
                        return (
                          <div key={resource.id} style={{ background: th.surface, borderRadius: 16, padding: '13px 14px', boxShadow: `inset 0 0 0 1px ${th.line}` }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                              <span style={{ fontFamily: th.fontUI, fontWeight: 700, fontSize: 15, color: th.text }}>{resource.name}</span>
                              <Chip color={ct.color} icon={ct.icon}>{ct.label}</Chip>
                              {courtFormat(typeof resource.attributes?.format === 'string' ? resource.attributes.format : undefined) && <Chip color={SINGLE_COLOR}>Single</Chip>}
                              <span style={{ marginLeft: 'auto', textAlign: 'right' }}>
                                <span style={{ fontFamily: th.fontDisplay, fontWeight: 600, fontSize: 18, color: th.text }}>{Number(resource.pricePerHour)}€<span style={{ fontFamily: th.fontUI, fontSize: 11, color: th.textMute, fontWeight: 500 }}>/h</span></span>
                                {resource.offPeakPricePerHour && <span style={{ display: 'block', fontFamily: th.fontUI, fontSize: 11, fontWeight: 600, color: th.accentWarm }}>{Number(resource.offPeakPricePerHour)}€/h en heures creuses</span>}
                              </span>
                            </div>
                            {slots.length === 0 ? (
                              <div style={{ fontFamily: th.fontUI, fontSize: 13, color: th.textFaint }}>Aucun créneau ce jour.</div>
                            ) : (
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                                {slots.map((s) => s.available ? (
                                  <button key={s.startTime} onClick={() => onSlot(resource.id, s.pricePerHour, s)} title={s.offPeak ? 'Heures creuses' : undefined}
                                    style={{ border: 'none', cursor: 'pointer', borderRadius: 9, padding: '7px 11px', background: th.surface2, color: th.text, fontFamily: th.fontMono, fontSize: 13.5, fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                                    {formatHour(s.startTime, club.timezone)}
                                    {s.offPeak && <span title="Heures creuses" style={{ width: 5, height: 5, borderRadius: '50%', background: th.accentWarm }} />}
                                  </button>
                                ) : (
                                  <span key={s.startTime} title="Réservé"
                                    style={{ borderRadius: 9, padding: '7px 11px', background: th.takenBg, color: th.takenText, fontFamily: th.fontMono, fontSize: 13.5, fontWeight: 500, textDecoration: `line-through ${th.takenText}`, cursor: 'not-allowed' }}>
                                    {formatHour(s.startTime, club.timezone)}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
                </div>
              )}
            </div>
          </>
        ) : (
          /* onglet Terrains : cartes vers la page détail */
          club.clubSports.map((cs) => (
            <div key={cs.id} style={{ padding: '18px 20px 0' }}>
              <div style={{ fontFamily: th.fontUI, fontWeight: 700, fontSize: 13, letterSpacing: 0.4, textTransform: 'uppercase', color: th.textMute, marginBottom: 12 }}>{cs.sport.icon ? `${cs.sport.icon} ` : ''}{cs.sport.name}</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12 }}>
                {cs.resources.map((r) => {
                  const ct = courtType(typeof r.attributes?.surface === 'string' ? r.attributes.surface : undefined);
                  return (
                    <Link key={r.id} href={`/courts/${r.id}`} style={{ textDecoration: 'none' }}>
                      <div style={{ background: th.surface, borderRadius: 18, overflow: 'hidden', boxShadow: `${th.shadowSoft}, inset 0 0 0 1px ${th.line}` }}>
                        <div style={{ position: 'relative' }}>
                          <Placeholder label={r.name} height={92} radius={0} />
                          <div style={{ position: 'absolute', top: 10, left: 10, display: 'flex', gap: 6 }}>
                            <Chip color={ct.color} icon={ct.icon}>{ct.label}</Chip>
                            {courtFormat(typeof r.attributes?.format === 'string' ? r.attributes.format : undefined) && <Chip color={SINGLE_COLOR}>Single</Chip>}
                          </div>
                        </div>
                        <div style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span style={{ fontFamily: th.fontDisplay, fontWeight: 600, fontSize: 20, color: th.text }}>{r.name}</span>
                          <span style={{ fontFamily: th.fontDisplay, fontWeight: 600, fontSize: 20, color: th.text }}>{Number(r.pricePerHour)}€<span style={{ fontFamily: th.fontUI, fontSize: 11, color: th.textMute }}> /h</span></span>
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>

      {booking && (
        <BookingModal
          slot={booking.slot}
          resourceId={booking.resourceId}
          pricePerHour={booking.price}
          duration={duration}
          token={token ?? ''}
          timezone={club.timezone}
          moveReservationId={moveRes?.id}
          packages={moveRes ? [] : myPackages}
          onClose={() => setBooking(null)}
          onConfirmed={() => {
            setBooking(null);
            setConfirmed(moveRes ? 'moved' : 'booked');
            if (moveRes) { setMoveRes(null); setMoveId(null); router.replace('/reserver'); }
            else if (token) { api.getMyClubPackages(club.slug, token).then(setMyPackages).catch(() => {}); }
            loadAvail();
          }}
        />
      )}
    </Screen>
  );
}
