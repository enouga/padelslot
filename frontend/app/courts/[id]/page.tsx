'use client';
import { useState, useCallback, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api, TimeSlot, Reservation, SSEEvent, PublicResource } from '@/lib/api';
import CourtCalendar from '@/components/CourtCalendar';
import BookingModal from '@/components/BookingModal';
import DateSelector from '@/components/DateSelector';
import { useCourtSSE } from '@/lib/useCourtSSE';
import { useTheme } from '@/lib/ThemeProvider';
import { useAuth } from '@/lib/useAuth';
import { Screen } from '@/components/ui/Screen';
import { TopBar, Chip, LiveDot, Placeholder, Segmented } from '@/components/ui/atoms';
import { Icon } from '@/components/ui/Icon';
import { courtType, courtFormat } from '@/lib/courtType';
import { effectiveDurations, defaultDuration, durationLabel } from '@/lib/duration';

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function CourtBooking() {
  const params = useParams();
  const router = useRouter();
  const { th } = useTheme();
  const resourceId = typeof params.id === 'string' ? params.id : '';
  const { token, ready } = useAuth();

  const [resource, setResource]         = useState<PublicResource | null>(null);
  const [date, setDate]                 = useState(todayISO());
  const [duration, setDuration]         = useState<number>(90);
  const [slots, setSlots]               = useState<TimeSlot[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null);
  const [showModal, setShowModal]       = useState(false);
  const [confirmed, setConfirmed]       = useState<Reservation | null>(null);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState<string | null>(null);

  const tz = resource?.club.timezone;

  useEffect(() => { if (ready && !token) router.replace('/login'); }, [ready, token, router]);

  useEffect(() => {
    if (!resourceId) return;
    api.getResource(resourceId).then(setResource).catch(() => setResource(null));
  }, [resourceId]);

  const durations = resource
    ? effectiveDurations(resource.clubSport.durationsMin, resource.clubSport.sport.defaultDurationsMin)
    : [90];

  // À l'arrivée de la ressource, caler la durée sur celles proposées (défaut 1h30).
  useEffect(() => {
    if (resource && !durations.includes(duration)) setDuration(defaultDuration(durations));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resource]);

  const loadSlots = useCallback(async (d: string, dur: number) => {
    if (!resourceId) return;
    setLoading(true);
    setSelectedSlot(null);
    try {
      setError(null);
      setSlots(await api.getAvailability(resourceId, d, dur));
    } catch (e) {
      setSlots([]);
      setError((e as Error).message || 'Impossible de charger les créneaux.');
    } finally {
      setLoading(false);
    }
  }, [resourceId]);

  useEffect(() => { loadSlots(date, duration); }, [loadSlots, date, duration]);

  const handleSSE = useCallback((event: SSEEvent) => {
    if (!event.startTime || event.type === 'connected') return;
    setSlots((prev) => prev.map((slot) =>
      slot.startTime !== event.startTime ? slot : { ...slot, available: event.type === 'slot_released' },
    ));
  }, []);

  useCourtSSE(resourceId || null, handleSSE);

  const freeCount = slots.filter((s) => s.available).length;
  const ct = courtType(typeof resource?.attributes?.surface === 'string' ? resource.attributes.surface : undefined);
  const isSingle = courtFormat(typeof resource?.attributes?.format === 'string' ? resource.attributes.format : undefined);
  const backTo = '/';

  return (
    <Screen style={{ maxWidth: 760 }}>
      <div style={{ paddingBottom: 30 }}>
        <TopBar
          title={resource ? resource.name : 'Réservation'}
          logoHref={backTo}
          right={resource ? (
            <div style={{ display: 'flex', gap: 6 }}>
              <Chip tone="accent" icon={ct.icon}>{ct.label}</Chip>
              {isSingle && <Chip tone="line">Single</Chip>}
            </div>
          ) : undefined}
        />

        <div style={{ padding: '0 16px' }}>
          <Placeholder label={`photo · ${resource?.name ?? 'terrain'}`} height={132} />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <LiveDot />
              <span style={{ fontFamily: th.fontUI, fontSize: 13.5, color: th.text }}>Disponibilités en direct</span>
            </div>
            <span style={{ fontFamily: th.fontMono, fontSize: 12, color: th.textFaint }}>maj. en direct</span>
          </div>
        </div>

        {confirmed && (
          <div style={{ margin: '16px 16px 0', display: 'flex', alignItems: 'center', gap: 10, background: th.accent, color: th.onAccent, borderRadius: 14, padding: '12px 14px' }}>
            <Icon name="check" size={18} color={th.onAccent} stroke={2.4} />
            <span style={{ fontFamily: th.fontUI, fontSize: 14, fontWeight: 600 }}>Réservation confirmée !</span>
          </div>
        )}

        <div style={{ padding: '18px 16px 4px' }}>
          <DateSelector value={date} onChange={setDate} days={7} />
        </div>

        {durations.length > 1 && (
          <div style={{ padding: '16px 16px 0' }}>
            <Segmented<number> value={duration} onChange={setDuration}
              options={durations.map((d) => ({ value: d, label: durationLabel(d) }))} />
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 16px 12px' }}>
          <span style={{ fontFamily: th.fontUI, fontWeight: 700, fontSize: 14, color: th.text }}>
            Créneaux <span style={{ color: th.textMute, fontWeight: 500 }}>· {freeCount} libres</span>
          </span>
          <div style={{ display: 'flex', gap: 14 }}>
            {([['Libre', th.surface2], ['Réservé', th.takenBg]] as const).map(([l, c]) => (
              <span key={l} style={{ display: 'flex', alignItems: 'center', gap: 5, fontFamily: th.fontUI, fontSize: 11.5, color: th.textMute }}>
                <span style={{ width: 11, height: 11, borderRadius: 4, background: c }} />{l}
              </span>
            ))}
          </div>
        </div>

        <div style={{ padding: '0 16px' }}>
          {error && (
            <div style={{ fontFamily: th.fontUI, fontSize: 13.5, color: th.onAccent, background: th.accent, padding: '11px 14px', borderRadius: 12, fontWeight: 600, marginBottom: 12 }}>{error}</div>
          )}
          {loading ? (
            <div style={{ padding: '40px 0', textAlign: 'center', fontFamily: th.fontUI, color: th.textFaint }}>Chargement…</div>
          ) : (
            <CourtCalendar
              slots={slots}
              onSelectSlot={(slot) => { setSelectedSlot(slot); setShowModal(true); }}
              selectedSlot={selectedSlot}
              timezone={tz}
            />
          )}
        </div>
      </div>

      {showModal && selectedSlot && (
        <BookingModal
          slot={selectedSlot}
          resourceId={resourceId}
          pricePerHour={resource?.pricePerHour ?? '0'}
          duration={duration}
          token={token ?? ''}
          timezone={tz}
          onClose={() => { setShowModal(false); setSelectedSlot(null); }}
          onConfirmed={(reservation) => { setShowModal(false); setConfirmed(reservation); loadSlots(date, duration); }}
        />
      )}
    </Screen>
  );
}

export default function CourtPage() {
  return <CourtBooking />;
}
