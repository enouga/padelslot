'use client';
import { useCallback, useEffect, useState } from 'react';
import { api, ClubDetail, Announcement, Sponsor, MyReservation, Tournament, ClubEvent, ClubAvailability } from '@/lib/api';
import { useTheme } from '@/lib/ThemeProvider';
import { useAuth } from '@/lib/useAuth';
import { effectiveDurations, defaultDuration } from '@/lib/duration';
import { pickUpcomingSlots, todayISO } from '@/lib/clubhouse';
import { mergeAgenda } from '@/lib/events';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Chip } from '@/components/ui/atoms';
import { Icon } from '@/components/ui/Icon';
import { HeroAnnouncement } from '@/components/clubhouse/HeroAnnouncement';
import { SlotsAlaUne } from '@/components/clubhouse/SlotsAlaUne';
import { TournamentsAlaUne } from '@/components/clubhouse/TournamentsAlaUne';
import { PartnerOffers } from '@/components/clubhouse/PartnerOffers';

function formatDateTime(iso: string, tz: string): string {
  return new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: tz }).format(new Date(iso)).replace(':', 'h');
}

// Page « Club-house » : hero À la une, créneaux à saisir, prochains tournois,
// vos réservations, annonces, offres partenaires. Chaque bloc charge en
// indépendance et se masque en silence si vide ou en erreur.
export function ClubHouse({ club }: { club: ClubDetail }) {
  const { th } = useTheme();
  const { token, ready } = useAuth();
  const [ann, setAnn] = useState<Announcement[]>([]);
  const [spons, setSpons] = useState<Sponsor[]>([]);
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [events, setEvents] = useState<ClubEvent[]>([]);
  const [avail, setAvail] = useState<ClubAvailability[]>([]);
  const [next, setNext] = useState<MyReservation[]>([]);
  const [confirmCancel, setConfirmCancel] = useState<MyReservation | null>(null);
  const [cancelling, setCancelling] = useState(false);

  const duration = defaultDuration(Array.from(new Set(
    club.clubSports.flatMap((cs) => effectiveDurations(cs.durationsMin, cs.sport.defaultDurationsMin)),
  )).sort((a, b) => a - b));

  const loadNext = useCallback(async () => {
    if (!token) return;
    try {
      const rs = await api.getMyReservations(token);
      setNext(rs.filter((r) => r.resource.club.slug === club.slug && r.status !== 'CANCELLED' && new Date(r.startTime) > new Date()).slice(0, 3));
    } catch { /* silencieux */ }
  }, [token, club.slug]);

  useEffect(() => { api.getClubAnnouncements(club.slug).then(setAnn).catch(() => setAnn([])); }, [club.slug]);
  useEffect(() => { api.getClubSponsors(club.slug).then(setSpons).catch(() => setSpons([])); }, [club.slug]);
  useEffect(() => { api.getClubTournaments(club.slug).then(setTournaments).catch(() => setTournaments([])); }, [club.slug]);
  useEffect(() => { api.getClubEvents(club.slug).then(setEvents).catch(() => setEvents([])); }, [club.slug]);
  useEffect(() => { api.getClubAvailability(club.slug, todayISO(), duration).then(setAvail).catch(() => setAvail([])); }, [club.slug, duration]);
  useEffect(() => { if (ready && token) loadNext(); }, [ready, token, loadNext]);

  const cancel = async (r: MyReservation) => {
    if (!token) return;
    setCancelling(true);
    try { await api.cancelReservation(r.id, token); setConfirmCancel(null); await loadNext(); }
    catch { /* l'erreur reste affichée dans le dialog via busy off */ }
    finally { setCancelling(false); }
  };

  const sectionTitle = (t: string) => (
    <div style={{ fontFamily: th.fontUI, fontWeight: 700, fontSize: 13, letterSpacing: 0.4, textTransform: 'uppercase', color: th.textMute, marginBottom: 12 }}>{t}</div>
  );

  // Hero : l'annonce épinglée la plus récente (l'API renvoie épinglées d'abord) ; pas répétée dans la liste.
  const hero = ann.length > 0 && ann[0].pinned ? ann[0] : null;
  const restAnn = hero ? ann.slice(1) : ann;
  const now = new Date();
  const slots = pickUpcomingSlots(avail, now);
  const nextEvents = mergeAgenda(tournaments, events, now).slice(0, 3);

  const empty = !hero && slots.length === 0 && nextEvents.length === 0 && restAnn.length === 0 && spons.length === 0 && next.length === 0;

  return (
    <>
      {hero && <HeroAnnouncement announcement={hero} />}

      {/* Grille action : créneaux + events (tournois + animations), côte à côte ≥ 600px */}
      {(slots.length > 0 || nextEvents.length > 0) && (
        <div style={{ padding: '16px 20px 0' }}>
          <style>{`.ch-grid{display:grid;grid-template-columns:1fr;gap:12px}@media(min-width:600px){.ch-grid{grid-template-columns:1fr 1fr}}`}</style>
          <div className="ch-grid">
            <SlotsAlaUne slots={slots} timezone={club.timezone} />
            <TournamentsAlaUne items={nextEvents} timezone={club.timezone} />
          </div>
        </div>
      )}

      {/* Vos prochaines réservations (repris de ClubInfo) */}
      {next.length > 0 && (
        <div style={{ padding: '22px 20px 0' }}>
          {sectionTitle('Vos prochaines réservations')}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {next.map((r) => (
              <button key={r.id} onClick={() => setConfirmCancel(r)} style={{ border: 'none', cursor: 'pointer', textAlign: 'left', width: '100%', background: th.surface, borderRadius: 14, padding: '12px 14px', boxShadow: `inset 0 0 0 1px ${th.line}`, display: 'flex', alignItems: 'center', gap: 10 }}>
                <Icon name="ticket" size={18} color={th.accent} />
                <span style={{ flex: 1, fontFamily: th.fontUI, fontSize: 14, color: th.text }}>{r.resource.name} · {formatDateTime(r.startTime, r.resource.club.timezone)}</span>
                <span style={{ fontFamily: th.fontUI, fontSize: 12.5, fontWeight: 600, color: th.textMute }}>Gérer</span>
                <Icon name="arrowR" size={15} color={th.textMute} />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Annonces (repris de ClubInfo, sans celle du hero) */}
      {restAnn.length > 0 && (
        <div style={{ padding: '26px 20px 0' }}>
          {sectionTitle('Annonces')}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {restAnn.map((a) => (
              <div key={a.id} style={{ background: th.surface, borderRadius: 16, padding: '14px 16px', boxShadow: `inset 0 0 0 1px ${th.line}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {a.pinned && <Chip tone="accent">Épinglé</Chip>}
                  <span style={{ fontFamily: th.fontDisplay, fontWeight: 600, fontSize: 18, color: th.text }}>{a.title}</span>
                </div>
                <p style={{ fontFamily: th.fontUI, fontSize: 14, color: th.textMute, marginTop: 8, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{a.body}</p>
                {a.linkUrl && <a href={a.linkUrl} target="_blank" rel="noreferrer" style={{ fontFamily: th.fontUI, fontSize: 13.5, fontWeight: 700, color: th.accent }}>En savoir plus →</a>}
              </div>
            ))}
          </div>
        </div>
      )}

      <PartnerOffers sponsors={spons} />

      {empty && (
        <div style={{ padding: '40px 20px', textAlign: 'center', fontFamily: th.fontUI, fontSize: 14, color: th.textMute }}>
          Pas d&apos;informations pour le moment.
        </div>
      )}

      {confirmCancel && (
        <ConfirmDialog
          title="Annuler la réservation ?"
          detail={<>{confirmCancel.resource.name} · {formatDateTime(confirmCancel.startTime, confirmCancel.resource.club.timezone)}</>}
          message="Cette action est définitive : le créneau sera remis à disposition des autres joueurs."
          confirmLabel="Annuler la réservation"
          cancelLabel="Retour"
          busy={cancelling}
          onConfirm={() => cancel(confirmCancel)}
          onCancel={() => setConfirmCancel(null)}
        />
      )}
    </>
  );
}
