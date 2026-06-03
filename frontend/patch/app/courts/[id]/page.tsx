'use client';
import { useState, useCallback, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api, TimeSlot, Reservation, SSEEvent } from '@/lib/api';
import CourtCalendar from '@/components/CourtCalendar';
import BookingModal from '@/components/BookingModal';
import DateSelector from '@/components/DateSelector';
import Logo from '@/components/Logo';
import { useCourtSSE } from '@/lib/useCourtSSE';

function getTodayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function CourtPage() {
  const params = useParams();
  const router = useRouter();
  const courtId = typeof params.id === 'string' ? params.id : '';

  const [token, setToken]               = useState<string | null>(null);
  const [date, setDate]                 = useState(getTodayDate());
  const [duration, setDuration]         = useState<60 | 90 | 120>(60);
  const [slots, setSlots]               = useState<TimeSlot[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null);
  const [showModal, setShowModal]       = useState(false);
  const [confirmed, setConfirmed]       = useState<Reservation | null>(null);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState<string | null>(null);

  useEffect(() => {
    const t = localStorage.getItem('token');
    if (!t) { router.replace('/login'); return; }
    setToken(t);
  }, [router]);

  const loadSlots = useCallback(async (d: string, dur: 60 | 90 | 120) => {
    if (!courtId) return;
    setLoading(true);
    setSelectedSlot(null);
    try {
      setError(null);
      setSlots(await api.getAvailability(courtId, d, dur));
    } catch (e) {
      setSlots([]);
      setError((e as Error).message || 'Impossible de charger les créneaux.');
    } finally {
      setLoading(false);
    }
  }, [courtId]);

  useEffect(() => { loadSlots(date, duration); }, [loadSlots, date, duration]);

  const handleSSE = useCallback((event: SSEEvent) => {
    if (!event.startTime || event.type === 'connected') return;
    setSlots((prev) =>
      prev.map((slot) =>
        slot.startTime !== event.startTime ? slot : { ...slot, available: event.type === 'slot_released' },
      ),
    );
  }, []);
  useCourtSSE(courtId || null, handleSSE);

  const handleSelectSlot = (slot: TimeSlot) => { setSelectedSlot(slot); setShowModal(true); };
  const handleConfirmed = (reservation: Reservation) => {
    setShowModal(false);
    setConfirmed(reservation);
    loadSlots(date, duration);
  };

  return (
    <main className="mx-auto max-w-3xl px-6 py-6">
      {/* En-tête de marque */}
      <header className="mb-8 flex items-center justify-between">
        <Logo size={30} />
        <button
          onClick={() => router.push('/courts')}
          className="font-mono text-[11px] uppercase tracking-[0.14em] text-mute hover:text-ink"
        >
          ← Terrains
        </button>
      </header>

      <h1 className="mb-6 font-display text-3xl font-semibold text-ink">Réservez votre créneau</h1>

      {confirmed && (
        <div className="mb-6 rounded-xl bg-accent-50 p-4 text-accent-600">
          Réservation confirmée — {confirmed.id}
        </div>
      )}

      {/* Sélecteur de dates — proposition B */}
      <div className="mb-6 rounded-2xl border border-ink/10 bg-card p-5">
        <DateSelector value={date} onChange={setDate} />
      </div>

      {/* Durée */}
      <div className="mb-6 flex items-center gap-3">
        <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-mute">Durée</span>
        <div className="flex gap-2">
          {([60, 90, 120] as const).map((d) => (
            <button
              key={d}
              onClick={() => setDuration(d)}
              className={[
                'rounded-lg px-4 py-2 text-sm font-medium transition-colors',
                duration === d ? 'bg-brand-500 text-white' : 'border border-ink/10 bg-card text-ink-soft hover:bg-paper',
              ].join(' ')}
            >
              {d === 60 ? '1 h' : d === 90 ? '1h30' : '2 h'}
            </button>
          ))}
        </div>
      </div>

      {error && <div className="mb-4 rounded-lg bg-red-50 p-4 text-sm text-red-700">{error}</div>}

      {loading ? (
        <div className="py-12 text-center text-faint">Chargement…</div>
      ) : (
        <CourtCalendar slots={slots} onSelectSlot={handleSelectSlot} selectedSlot={selectedSlot} />
      )}

      {showModal && selectedSlot && (
        <BookingModal
          slot={selectedSlot}
          courtId={courtId}
          pricePerHour="25"
          duration={duration}
          token={token ?? ''}
          onClose={() => { setShowModal(false); setSelectedSlot(null); }}
          onConfirmed={handleConfirmed}
        />
      )}
    </main>
  );
}
