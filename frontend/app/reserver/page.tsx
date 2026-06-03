'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, ClubDetail, ClubAvailability, TimeSlot } from '@/lib/api';
import { useTheme } from '@/lib/ThemeProvider';
import { useClub } from '@/lib/ClubProvider';
import { useAuth } from '@/lib/useAuth';
import { courtType, courtFormat, SINGLE_COLOR } from '@/lib/courtType';
import { effectiveDurations, defaultDuration, durationLabel } from '@/lib/duration';
import { Screen } from '@/components/ui/Screen';
import { BackButton, Chip, Placeholder, Segmented, ThemeToggle, LogoutButton, MyBookingsButton } from '@/components/ui/atoms';
import { Icon } from '@/components/ui/Icon';
import BookingModal from '@/components/BookingModal';
import DateSelector from '@/components/DateSelector';

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

function ClubContent({ club }: { club: ClubDetail }) {
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
  const [confirmed, setConfirmed] = useState(false);
  const [isSub, setIsSub]       = useState(false);

  const windowDays = (isSub ? club.memberBookingDays : club.publicBookingDays);
  const days = nextDays(Math.max(1, windowDays + 1));

  useEffect(() => {
    if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('tab') === 'courts') setTab('courts');
  }, []);

  // Statut d'abonné en lecture seule : l'abonnement est attribué par le club
  // (back-office). Sert à connaître la fenêtre de réservation du joueur.
  useEffect(() => {
    if (!token) { setIsSub(false); return; }
    api.getMyMemberships(token).then((ms) => setIsSub(ms.some((m) => m.clubId === club.id && m.isSubscriber))).catch(() => {});
  }, [token, club.id]);

  const loadAvail = useCallback(async () => {
    setLoadingA(true);
    try { setAvail(await api.getClubAvailability(club.slug, date, duration)); }
    catch { setAvail([]); }
    finally { setLoadingA(false); }
  }, [club.slug, date, duration]);

  useEffect(() => { if (tab === 'book') loadAvail(); }, [tab, loadAvail]);

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
    <Screen style={{ maxWidth: 820 }}>
      <div style={{ paddingBottom: 40 }}>
        <div style={{ padding: '24px 20px 6px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <BackButton href="/" />
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {isSub && <Chip tone="accent" icon="check">Abonné</Chip>}
              <MyBookingsButton />
              <ThemeToggle />
              <LogoutButton />
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 22 }}>
            {club.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={club.logoUrl} alt={club.name} style={{ width: 56, height: 56, borderRadius: 14, objectFit: 'cover', flexShrink: 0 }} />
            ) : (
              <div style={{ width: 56, height: 56, borderRadius: 14, background: th.accent, color: th.onAccent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: th.fontDisplay, fontWeight: 700, fontSize: 26, flexShrink: 0 }}>{club.name.slice(0, 1)}</div>
            )}
            <div>
              <div style={{ fontFamily: th.fontDisplay, fontWeight: 600, fontSize: 30, lineHeight: 1.02, color: th.text, letterSpacing: -0.5 }}>{club.name}</div>
              {club.city && <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontFamily: th.fontUI, fontSize: 13.5, color: th.textMute, marginTop: 4 }}><Icon name="pin" size={13} color={th.textMute} />{club.city}</div>}
            </div>
          </div>
          {club.description && <p style={{ fontFamily: th.fontUI, fontSize: 14.5, color: th.textMute, lineHeight: 1.5, marginTop: 14 }}>{club.description}</p>}
        </div>

        {confirmed && (
          <div style={{ margin: '14px 20px 0', display: 'flex', alignItems: 'center', gap: 10, background: th.accent, color: th.onAccent, borderRadius: 14, padding: '12px 14px' }}>
            <Icon name="check" size={18} color={th.onAccent} stroke={2.4} />
            <span style={{ fontFamily: th.fontUI, fontSize: 14, fontWeight: 600 }}>Réservation confirmée !</span>
          </div>
        )}

        {tab === 'book' ? (
          <>
            {/* sélecteur de dates — proposition B (semaine navigable) */}
            <div style={{ padding: '18px 20px 4px' }}>
              <DateSelector value={date} onChange={setDate} days={10} maxKey={days[days.length - 1]?.key} />
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
                              <span style={{ marginLeft: 'auto', fontFamily: th.fontDisplay, fontWeight: 600, fontSize: 18, color: th.text }}>{Number(resource.pricePerHour)}€<span style={{ fontFamily: th.fontUI, fontSize: 11, color: th.textMute, fontWeight: 500 }}>/h</span></span>
                            </div>
                            {slots.length === 0 ? (
                              <div style={{ fontFamily: th.fontUI, fontSize: 13, color: th.textFaint }}>Aucun créneau ce jour.</div>
                            ) : (
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                                {slots.map((s) => s.available ? (
                                  <button key={s.startTime} onClick={() => onSlot(resource.id, resource.pricePerHour, s)}
                                    style={{ border: 'none', cursor: 'pointer', borderRadius: 9, padding: '7px 11px', background: th.surface2, color: th.text, fontFamily: th.fontMono, fontSize: 13.5, fontWeight: 500 }}>
                                    {formatHour(s.startTime, club.timezone)}
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
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
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
          onClose={() => setBooking(null)}
          onConfirmed={() => { setBooking(null); setConfirmed(true); loadAvail(); }}
        />
      )}
    </Screen>
  );
}

export default function ReserverPage() {
  const { club, loading } = useClub();
  const { th } = useTheme();
  if (loading) return <div style={{ minHeight: '100vh', background: th.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: th.fontUI, color: th.textFaint }}>Chargement…</div>;
  if (!club) return <div style={{ minHeight: '100vh', background: th.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: th.fontUI, color: th.textMute }}>Club introuvable.</div>;
  return <ClubContent club={club} />;
}
