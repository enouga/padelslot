'use client';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { api, MyReservation, MyTournamentRegistration } from '@/lib/api';
import { useTheme } from '@/lib/ThemeProvider';
import { useAuth } from '@/lib/useAuth';
import { useClub } from '@/lib/ClubProvider';
import { Screen } from '@/components/ui/Screen';
import { BackButton, Chip, Segmented, ThemeToggle } from '@/components/ui/atoms';
import { ProfileMenu } from '@/components/ProfileMenu';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Icon } from '@/components/ui/Icon';
import { ClubNav } from '@/components/ClubNav';
import { MonthCalendar } from '@/components/calendar/MonthCalendar';
import { DayPanel } from '@/components/calendar/DayPanel';
import { buildCalendarEntries, entriesByDay, todayKey, addMonths } from '@/lib/calendar';

function fmtDate(iso: string, tz: string): string {
  return new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', timeZone: tz }).format(new Date(iso));
}
function fmtHour(iso: string, tz: string): string {
  return new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: tz }).format(new Date(iso)).replace(':', 'h');
}

const STATUS_LABEL: Record<string, string> = { PENDING: 'En attente', CONFIRMED: 'Confirmée', CANCELLED: 'Annulée' };

export default function MyReservationsPage() {
  const router = useRouter();
  const { th } = useTheme();
  const { token, ready } = useAuth();
  const { slug, club } = useClub();
  // Sur un sous-domaine club, réserver dans CE club (même host) ; sur la plateforme, l'annuaire.
  const reserveHref = slug ? '/reserver' : '/clubs';
  const [items, setItems]     = useState<MyReservation[]>([]);
  const [regs, setRegs]       = useState<MyTournamentRegistration[]>([]);
  const [tab, setTab]         = useState<'upcoming' | 'past' | 'calendar'>('calendar');
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState<MyReservation | null>(null);
  const [cancelling, setCancelling]       = useState(false);
  const [ym, setYm] = useState(() => {
    const [y, m] = todayKey().split('-').map(Number);
    return { year: y, month: m };
  });
  const [selectedDay, setSelectedDay] = useState(() => todayKey());

  useEffect(() => { if (ready && !token) router.replace('/login'); }, [ready, token, router]);

  const load = useCallback(async (t: string) => {
    setLoading(true);
    try {
      setError(null);
      const [reservations, tournaments] = await Promise.all([
        api.getMyReservations(t),
        api.getMyTournaments(t).catch(() => []), // calendrier sans tournois si l'appel échoue
      ]);
      setItems(reservations);
      setRegs(tournaments);
    }
    catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { if (token) load(token); }, [token, load]);

  const now = Date.now();
  const isUpcoming = (r: MyReservation) => r.status !== 'CANCELLED' && new Date(r.endTime).getTime() >= now;
  const upcoming = items.filter(isUpcoming);
  const past = items.filter((r) => !isUpcoming(r));
  const list = tab === 'past' ? past : upcoming;

  const byDay = useMemo(
    () => entriesByDay(buildCalendarEntries(items, regs, new Date())),
    [items, regs],
  );
  // Déplacement possible : sur l'hôte du club de la résa uniquement (la page Réserver y vit).
  const canMove = (r: MyReservation) =>
    !!slug && r.resource.club.slug === slug && r.status !== 'CANCELLED' && new Date(r.startTime).getTime() > now;

  const cancel = async (r: MyReservation) => {
    if (!token) return;
    setCancelling(true);
    try { setError(null); await api.cancelReservation(r.id, token); setConfirmCancel(null); await load(token); }
    catch (e) { setError((e as Error).message); }
    finally { setCancelling(false); }
  };

  return (
    <Screen>
      <div style={{ paddingBottom: 40 }}>
        {slug && club ? (
          <ClubNav club={club} />
        ) : (
          <div style={{ padding: '28px 20px 6px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <BackButton href="/clubs" />
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <button onClick={() => router.push('/clubs')}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, border: 'none', cursor: 'pointer', borderRadius: 12, padding: '8px 13px', background: th.accent, color: th.onAccent, fontFamily: th.fontUI, fontSize: 13.5, fontWeight: 700 }}>
                  <Icon name="plus" size={16} color={th.onAccent} />Réserver
                </button>
                <ThemeToggle />
                <ProfileMenu />
              </div>
            </div>
          </div>
        )}
        <div style={{ padding: '18px 20px 0', fontFamily: th.fontDisplay, fontWeight: 500, fontSize: 38, lineHeight: 1.05, color: th.text, letterSpacing: -0.5 }}>
          Mes réservations
        </div>

        <div style={{ padding: '16px 20px 0' }}>
          <Segmented<'upcoming' | 'past' | 'calendar'> value={tab} onChange={setTab}
            options={[
              { value: 'calendar', label: 'Calendrier' },
              { value: 'upcoming', label: `À venir · ${upcoming.length}` },
              { value: 'past', label: `Passées · ${past.length}` },
            ]} />
        </div>

        {error && <div style={{ margin: '14px 20px 0', background: th.accent, color: th.onAccent, borderRadius: 12, padding: '11px 14px', fontFamily: th.fontUI, fontSize: 13.5, fontWeight: 600 }}>{error}</div>}

        {tab === 'calendar' ? (
          <div style={{ padding: '18px 20px 0' }}>
            {loading ? (
              <div style={{ padding: '30px 0', textAlign: 'center', fontFamily: th.fontUI, color: th.textFaint }}>Chargement…</div>
            ) : (
              <>
                <MonthCalendar
                  year={ym.year} month={ym.month} byDay={byDay}
                  selected={selectedDay} todayKey={todayKey()}
                  onSelect={setSelectedDay}
                  onNavigate={(delta) => setYm((v) => addMonths(v.year, v.month, delta))}
                />
                <DayPanel
                  dayKey={selectedDay}
                  entries={byDay.get(selectedDay) ?? []}
                  canMove={canMove}
                  onMove={(r) => router.push(`/reserver?move=${r.id}`)}
                  onCancel={setConfirmCancel}
                  onReserve={() => router.push(reserveHref)}
                  reserveLabel={slug ? 'Réserver un créneau' : 'Trouver un club'}
                />
              </>
            )}
          </div>
        ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 13, padding: '18px 20px 0' }}>
          {loading ? (
            <div style={{ padding: '30px 0', textAlign: 'center', fontFamily: th.fontUI, color: th.textFaint }}>Chargement…</div>
          ) : list.length === 0 ? (
            <div style={{ padding: '24px 0', textAlign: 'center', fontFamily: th.fontUI, color: th.textMute }}>
              {tab === 'upcoming' ? 'Aucune réservation à venir.' : 'Aucune réservation passée.'}
              {tab === 'upcoming' && (
                <div style={{ marginTop: 12 }}>
                  <button onClick={() => router.push(reserveHref)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: th.fontUI, fontSize: 14, fontWeight: 700, color: th.text, textDecoration: 'underline', textUnderlineOffset: 3 }}>{slug ? 'Réserver un créneau' : 'Trouver un club'}</button>
                </div>
              )}
            </div>
          ) : (
            list.map((r) => {
              const tz = r.resource.club.timezone;
              const upcoming = tab === 'upcoming';
              return (
                <div key={r.id} style={{ background: th.surface, borderRadius: 20, padding: 16, boxShadow: `inset 0 0 0 1px ${th.line}`, display: 'flex', gap: 14, opacity: upcoming ? 1 : 0.7 }}>
                  <div style={{ width: 56, flexShrink: 0, textAlign: 'center', borderRight: `1px solid ${th.line}`, paddingRight: 14, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                    <span style={{ fontFamily: th.fontDisplay, fontWeight: 600, fontSize: 22, lineHeight: 1, color: th.text }}>{new Intl.DateTimeFormat('fr-FR', { day: 'numeric', timeZone: tz }).format(new Date(r.startTime))}</span>
                    <span style={{ fontFamily: th.fontUI, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.4, color: th.textMute, marginTop: 3 }}>{new Intl.DateTimeFormat('fr-FR', { month: 'short', timeZone: tz }).format(new Date(r.startTime)).replace('.', '')}</span>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <span style={{ fontFamily: th.fontUI, fontWeight: 700, fontSize: 16, color: th.text }}>{r.resource.name}</span>
                      <Chip tone={r.status === 'CONFIRMED' ? 'accent' : 'line'}>{STATUS_LABEL[r.status]}</Chip>
                    </div>
                    <div style={{ fontFamily: th.fontUI, fontSize: 13, color: th.textMute, marginTop: 3 }}>{r.resource.club.name}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 9, fontFamily: th.fontUI, fontSize: 13, color: th.textMute }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><Icon name="clock" size={14} color={th.textMute} />{fmtHour(r.startTime, tz)}–{fmtHour(r.endTime, tz)}</span>
                      <span style={{ fontFamily: th.fontMono }}>{Number(r.totalPrice)}€</span>
                      {upcoming && (
                        <button onClick={() => setConfirmCancel(r)} style={{ marginLeft: 'auto', border: `1px solid ${th.line}`, background: 'transparent', cursor: 'pointer', borderRadius: 9, padding: '5px 11px', fontFamily: th.fontUI, fontSize: 12.5, fontWeight: 600, color: '#ff7a4d' }}>Annuler</button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
        )}
      </div>

      {confirmCancel && (
        <ConfirmDialog
          title="Annuler la réservation ?"
          detail={
            <>
              {confirmCancel.resource.name} · {fmtDate(confirmCancel.startTime, confirmCancel.resource.club.timezone)}
              {' · '}
              {fmtHour(confirmCancel.startTime, confirmCancel.resource.club.timezone)}–{fmtHour(confirmCancel.endTime, confirmCancel.resource.club.timezone)}
            </>
          }
          message="Cette action est définitive : le créneau sera remis à disposition des autres joueurs."
          confirmLabel="Annuler la réservation"
          cancelLabel="Retour"
          busy={cancelling}
          onConfirm={() => cancel(confirmCancel)}
          onCancel={() => setConfirmCancel(null)}
        />
      )}
    </Screen>
  );
}
