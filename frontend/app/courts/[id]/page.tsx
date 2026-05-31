'use client';
import { useState, useCallback, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api, TimeSlot, Reservation, SSEEvent } from '@/lib/api';
import CourtCalendar from '@/components/CourtCalendar';
import BookingModal from '@/components/BookingModal';
import { useCourtSSE } from '@/lib/useCourtSSE';

function getTodayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function CourtPage() {
  const params = useParams();
  const router = useRouter();
  const courtId = typeof params.id === 'string' ? params.id : '';

  const [token, setToken]                 = useState<string | null>(null);
  const [date, setDate]                   = useState(getTodayDate());
  const [duration, setDuration]           = useState<60 | 90 | 120>(60);
  const [slots, setSlots]                 = useState<TimeSlot[]>([]);
  const [selectedSlot, setSelectedSlot]   = useState<TimeSlot | null>(null);
  const [showModal, setShowModal]         = useState(false);
  const [confirmed, setConfirmed]         = useState<Reservation | null>(null);
  const [loading, setLoading]             = useState(true);
  const [error, setError]                 = useState<string | null>(null);

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
      const data = await api.getAvailability(courtId, d, dur);
      setSlots(data);
    } catch (e) {
      setSlots([]);
      setError((e as Error).message || 'Impossible de charger les créneaux.');
    } finally {
      setLoading(false);
    }
  }, [courtId]);

  useEffect(() => {
    loadSlots(date, duration);
  }, [loadSlots, date, duration]);

  const handleSSE = useCallback((event: SSEEvent) => {
    if (!event.startTime || event.type === 'connected') return;
    setSlots((prev) =>
      prev.map((slot) => {
        if (slot.startTime !== event.startTime) return slot;
        return { ...slot, available: event.type === 'slot_released' };
      }),
    );
  }, []);

  useCourtSSE(courtId || null, handleSSE);

  const handleSelectSlot = (slot: TimeSlot) => {
    setSelectedSlot(slot);
    setShowModal(true);
  };

  const handleConfirmed = (reservation: Reservation) => {
    setShowModal(false);
    setConfirmed(reservation);
    loadSlots(date, duration);
  };

  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="mb-6 text-xl font-bold">Réservation</h1>

      {confirmed && (
        <div className="mb-6 rounded-xl bg-green-50 p-4 text-green-800">
          Réservation confirmée — {confirmed.id}
        </div>
      )}

      <div className="mb-6 flex flex-wrap gap-4">
        <input
          type="date"
          value={date}
          min={getTodayDate()}
          onChange={(e) => setDate(e.target.value)}
          className="rounded-lg border px-3 py-2 text-sm"
        />

        <select
          value={duration}
          onChange={(e) => setDuration(parseInt(e.target.value, 10) as 60 | 90 | 120)}
          className="rounded-lg border px-3 py-2 text-sm"
        >
          <option value={60}>1 heure</option>
          <option value={90}>1h30</option>
          <option value={120}>2 heures</option>
        </select>
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 p-4 text-sm text-red-700">{error}</div>
      )}
      {loading ? (
        <div className="py-12 text-center text-gray-400">Chargement...</div>
      ) : (
        <CourtCalendar
          slots={slots}
          onSelectSlot={handleSelectSlot}
          selectedSlot={selectedSlot}
        />
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
