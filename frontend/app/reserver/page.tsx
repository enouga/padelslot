'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, ClubDetail, ClubAvailability, TimeSlot } from '@/lib/api';
import { useTheme } from '@/lib/ThemeProvider';
import { useClub } from '@/lib/ClubProvider';
import { useAuth } from '@/lib/useAuth';
import { courtType, courtFormat } from '@/lib/courtType';
import { effectiveDurations, defaultDuration, durationLabel } from '@/lib/duration';
import { Screen } from '@/components/ui/Screen';
import { Logotype, Chip, Placeholder, Segmented, ThemeToggle, LogoutButton, MyBookingsButton } from '@/components/ui/atoms';
import { Icon } from '@/components/ui/Icon';
import BookingModal from '@/components/BookingModal';

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
    api.getMySubscriptions(token).then((ids) => setIsSub(ids.includes(club.id))).catch(() => {});
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
    <Screen style={{ maxWidth: 760 }}>
      <div style={{ paddingBottom: 40 }}>
        <div style={{ padding: '24px 20px 6px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Logotype size={20} />
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

        {/* onglets */}
        <div style={{ padding: '14px 20px 0' }}>
          <Segmented<'book' | 'courts'> value={tab} onChange={setTab}
            options={[{ value: 'book', label: 'Réserver' }, { value: 'courts', label: 'Terrains' }]} />
        </div>

        {confirmed && (
          <div style={{ margin: '14px 20px 0', display: 'flex', alignItems: 'center', gap: 10, background: th.accent, color: th.onAccent, borderRadius: 14, padding: '12px 14px' }}>
            <Icon name="check" size={18} color={th.onAccent} stroke={2.4} />
            <span style={{ fontFamily: th.fontUI, fontSize: 14, fontWeight: 600 }}>Réservation confirmée !</span>
          </div>
        )}

        {tab === 'book' ? (
          <>
            {/* date + durée — les jours passent à la ligne (pas de scroll horizontal) */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 9, padding: '18px 20px 4px' }}>
              {days.map((d) => {
                const on = d.key === date;
                return (
                  <button key={d.key} onClick={() => setDate(d.key)} style={{ border: 'none', cursor: 'pointer', flexShrink: 0, width: 56, padding: '10px 0', borderRadius: 14, background: on ? th.ink : th.surface2, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                    <span style={{ fontFamily: th.fontUI, fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4, color: on ? (th.mode === 'floodlit' ? th.textMute : '#cfccc0') : th.textMute }}>{d.dow}</span>
                    <span style={{ fontFamily: th.fontDisplay, fontSize: 22, fontWeight: 600, lineHeight: 1, color: on ? (th.mode === 'floodlit' ? th.text : '#f7f5ee') : th.text }}>{d.day}</span>
                  </button>
                );
              })}
            </div>
            {!isSub && club.memberBookingDays > club.publicBookingDays && (
              <div style={{ padding: '8px 20px 0', fontFamily: th.fontUI, fontSize: 12.5, color: th.textMute }}>
                Les abonnés du club réservent jusqu'à <b style={{ color: th.text }}>{club.memberBookingDays} j</b> à l'avance (vous : {club.publicBookingDays} j). Contactez le club pour devenir abonné.
              </div>
            )}
            <div style={{ padding: '14px 20px 0' }}>
              <Segmented<number> value={duration} onChange={setDuration} options={allDurations.map((d) => ({ value: d, label: durationLabel(d) }))} />
            </div>

            {/* grille : par sport, chaque terrain + ses créneaux libres */}
            <div style={{ padding: '8px 20px 0' }}>
              {loadingA ? (
                <div style={{ padding: '30px 0', textAlign: 'center', fontFamily: th.fontUI, color: th.textFaint }}>Chargement…</div>
              ) : avail.length === 0 ? (
                <div style={{ padding: '24px 0', textAlign: 'center', fontFamily: th.fontUI, color: th.textMute }}>Aucun terrain.</div>
              ) : (
                [...bySport.entries()].map(([sportName, items]) => (
                  <div key={sportName} style={{ marginTop: 14 }}>
                    <div style={{ fontFamily: th.fontUI, fontWeight: 700, fontSize: 13, letterSpacing: 0.4, textTransform: 'uppercase', color: th.textMute, marginBottom: 10 }}>{sportName}</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      {items.map(({ resource, slots }) => {
                        const ct = courtType(typeof resource.attributes?.surface === 'string' ? resource.attributes.surface : undefined);
                        return (
                          <div key={resource.id} style={{ background: th.surface, borderRadius: 16, padding: '13px 14px', boxShadow: `inset 0 0 0 1px ${th.line}` }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                              <span style={{ fontFamily: th.fontUI, fontWeight: 700, fontSize: 15, color: th.text }}>{resource.name}</span>
                              <Chip tone="line">{ct.label}</Chip>
                              {courtFormat(typeof resource.attributes?.format === 'string' ? resource.attributes.format : undefined) && <Chip tone="line">Single</Chip>}
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
                ))
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
                            <Chip tone="accent" icon={ct.icon}>{ct.label}</Chip>
                            {courtFormat(typeof r.attributes?.format === 'string' ? r.attributes.format : undefined) && <Chip tone="line">Single</Chip>}
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
