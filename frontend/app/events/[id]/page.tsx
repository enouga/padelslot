'use client';
import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useClub } from '@/lib/ClubProvider';
import { useAuth } from '@/lib/useAuth';
import { useTheme } from '@/lib/ThemeProvider';
import { api, ClubEventDetail, EventParticipant, MyEventRegistration } from '@/lib/api';
import { eventPlacesLabel, KIND_LABEL } from '@/lib/events';
import { fillRatio, formatDateTime, timelineSteps, waitlistPosition } from '@/lib/tournament';
import { Screen } from '@/components/ui/Screen';
import { Btn } from '@/components/ui/atoms';
import { Icon } from '@/components/ui/Icon';
import { ClubNav } from '@/components/ClubNav';
import { AgendaHero, MetaCardsRow, MetaCard } from '@/components/agenda/AgendaHero';
import { TournamentTimeline } from '@/components/tournament/TournamentTimeline';
import { ShareActions } from '@/components/tournament/ShareActions';
import { ParticipantsGrid } from '@/components/event/ParticipantsGrid';

const ERROR_LABEL: Record<string, string> = {
  MEMBERSHIP_REQUIRED: 'Cet event est réservé aux membres du club.',
  MEMBERSHIP_BLOCKED: 'Votre compte est bloqué dans ce club — rapprochez-vous de l’accueil.',
  ALREADY_REGISTERED: 'Vous êtes déjà inscrit.',
  REGISTRATION_CLOSED: 'Les inscriptions sont closes.',
  REGISTRATION_LOCKED: 'La date limite est passée, la désinscription se fait à l’accueil.',
  EVENT_NOT_OPEN: 'Cet event n’est pas ouvert aux inscriptions.',
};

export default function EventDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { club, loading } = useClub();
  const { token, ready } = useAuth();
  const { th } = useTheme();
  const router = useRouter();
  const [event, setEvent] = useState<ClubEventDetail | null>(null);
  const [participants, setParticipants] = useState<EventParticipant[] | null>(null);
  const [myReg, setMyReg] = useState<MyEventRegistration | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  // Horloge unique : null au premier rendu (hydration-safe), pour hero et timeline.
  const [now, setNow] = useState<Date | null>(null);

  const load = useCallback(() => {
    api.getEvent(id).then(setEvent).catch(() => setNotFound(true));
    api.getEventParticipants(id).then(setParticipants).catch(() => setParticipants([]));
    if (token) api.getMyEvents(token).then((regs) => setMyReg(regs.find((r) => r.event.id === id) ?? null)).catch(() => setMyReg(null));
  }, [id, token]);

  useEffect(() => { if (ready) load(); }, [ready, load]);
  useEffect(() => {
    const tick = () => setNow(new Date());
    const t = setTimeout(tick, 0);
    const h = setInterval(tick, 60_000);
    return () => { clearTimeout(t); clearInterval(h); };
  }, []);

  if (loading || !club || (!event && !notFound)) {
    return <div style={{ minHeight: '100vh', background: th.bg, color: th.textFaint, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: th.fontUI }}>Chargement…</div>;
  }

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true); setError(null);
    try { await fn(); load(); }
    catch (e) { const code = (e as Error).message; setError(ERROR_LABEL[code] ?? code); }
    finally { setBusy(false); }
  };

  if (notFound || !event) {
    return (
      <Screen>
        <div style={{ paddingBottom: 40 }}>
          <ClubNav club={club} />
          <div style={{ padding: '40px 20px', fontFamily: th.fontUI, color: th.textMute }}>Cet event n’existe pas ou n’est plus visible.</div>
        </div>
      </Screen>
    );
  }

  const tz = event.club.timezone;
  const deadlinePassed = new Date(event.registrationDeadline) <= new Date();
  const full = event.capacity != null && event.confirmedCount >= event.capacity;
  const places = eventPlacesLabel(event);
  const myWaitlistPos = myReg && participants ? waitlistPosition(participants, myReg.id) : null;

  const metaCards: MetaCard[] = [
    { icon: 'calendar', label: 'Début', value: formatDateTime(event.startTime, tz) + (event.endTime ? ` → ${formatDateTime(event.endTime, tz)}` : '') },
    { icon: 'clock', label: 'Clôture des inscriptions', value: formatDateTime(event.registrationDeadline, tz) },
    ...(event.price != null && Number(event.price) > 0 ? [{ icon: 'euro', label: 'Prix', value: `${Number(event.price)} € — règlement au club` } as MetaCard] : []),
  ];

  return (
    <Screen>
      <div style={{ paddingBottom: 48 }}>
        <ClubNav club={club} />

        <div style={{ padding: '14px 20px 0' }}>
          <button onClick={() => router.push('/events')} style={{ border: 'none', background: 'transparent', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5, fontFamily: th.fontUI, fontSize: 13, fontWeight: 600, color: th.textMute, padding: 0 }}>
            <Icon name="chevL" size={16} color={th.textMute} />Tous les events
          </button>
        </div>

        <AgendaHero
          pills={[{ label: KIND_LABEL[event.kind], strong: true }, ...(event.memberOnly ? [{ label: 'Réservé aux membres' }] : [])]}
          title={event.name}
          subtitle={event.club.name}
          deadline={event.registrationDeadline}
          now={now}
          ratio={fillRatio({ confirmedCount: event.confirmedCount, maxTeams: event.capacity })}
          counter={
            (event.capacity != null ? `${event.confirmedCount}/${event.capacity} inscrits` : `${event.confirmedCount} inscrit${event.confirmedCount > 1 ? 's' : ''}`)
            + (event.waitlistCount > 0 ? ` · ${event.waitlistCount} en attente` : '')
          }
          places={places}
        />
        <MetaCardsRow cards={metaCards} />
        <ShareActions item={event} uidPrefix="event" />
        {now && <TournamentTimeline steps={timelineSteps(event, now)} tz={tz} />}

        {event.description && (
          <p style={{ fontFamily: th.fontUI, fontSize: 14.5, color: th.textMute, margin: 0, padding: '18px 20px 0', lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{event.description}</p>
        )}

        <div style={{ padding: '24px 20px 0' }}>
          {error && <div style={{ background: '#3a1d1d', color: '#ff6b6b', borderRadius: 11, padding: '11px 13px', fontFamily: th.fontUI, fontSize: 13.5, marginBottom: 14 }}>{error}</div>}

          {!token && ready && (
            <Btn onClick={() => router.push('/login')} icon="user">Se connecter pour s’inscrire</Btn>
          )}
          {token && !myReg && !deadlinePassed && (
            <div>
              {full && <div style={{ fontFamily: th.fontUI, fontSize: 13, color: th.textMute, marginBottom: 10 }}>Event complet : vous serez placé en liste d’attente.</div>}
              <Btn onClick={() => act(() => api.registerEvent(event.id, token))} disabled={busy} icon="check">
                {busy ? '…' : full ? 'Rejoindre la liste d’attente' : 'S’inscrire'}
              </Btn>
            </div>
          )}
          {token && myReg && (
            <div style={{ background: th.surface, borderRadius: 16, padding: '16px 18px', boxShadow: `inset 0 0 0 1px ${th.line}`, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <span style={{ fontFamily: th.fontUI, fontSize: 14.5, fontWeight: 700, color: th.text }}>
                {myReg.status === 'CONFIRMED'
                  ? '✅ Vous êtes inscrit.'
                  : `⏳ Vous êtes en liste d’attente${myWaitlistPos != null ? ` · position n°${myWaitlistPos}` : ''}.`}
              </span>
              {!deadlinePassed ? (
                <Btn onClick={() => act(() => api.cancelEventRegistration(event.id, token))} disabled={busy} icon="x" variant="ghost">
                  {busy ? '…' : 'Se désinscrire'}
                </Btn>
              ) : (
                <span style={{ fontFamily: th.fontUI, fontSize: 13, color: th.textFaint }}>Inscriptions closes : la désinscription se fait à l’accueil.</span>
              )}
            </div>
          )}
          {deadlinePassed && !myReg && token && (
            <span style={{ fontFamily: th.fontUI, fontSize: 14, color: th.textMute }}>Les inscriptions sont closes.</span>
          )}
        </div>

        {/* Liste publique des inscrits */}
        <div style={{ padding: '28px 0 0' }}>
          <div style={{ fontFamily: th.fontDisplay, fontWeight: 600, fontSize: 18, color: th.text, marginBottom: 12, padding: '0 20px' }}>Inscrits</div>
          <ParticipantsGrid participants={participants} myRegId={myReg?.id} />
        </div>
      </div>
    </Screen>
  );
}
