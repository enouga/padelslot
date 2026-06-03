'use client';
import { useState, useEffect } from 'react';
import { api, TimeSlot, Reservation } from '@/lib/api';

interface BookingModalProps {
  slot: TimeSlot;
  courtId: string;
  pricePerHour: string;
  duration: 60 | 90 | 120;
  token: string;
  onClose: () => void;
  onConfirmed: (reservation: Reservation) => void;
}

const HOLD_SECONDS = 600;

function formatHour(iso: string): string {
  const d = new Date(iso);
  const h = (d.getUTCHours() + 2) % 24;
  const m = d.getUTCMinutes();
  return `${String(h).padStart(2, '0')}h${String(m).padStart(2, '0')}`;
}

export default function BookingModal({
  slot, courtId, pricePerHour, duration, token, onClose, onConfirmed,
}: BookingModalProps) {
  const [phase, setPhase]             = useState<'confirm' | 'pending' | 'error'>('confirm');
  const [reservation, setReservation] = useState<Reservation | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(HOLD_SECONDS);
  const [errorMsg, setErrorMsg]       = useState('');

  const totalPrice = (Number(pricePerHour) * (duration / 60)).toFixed(2);

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
      const res = await api.holdSlot(
        { courtId, startTime: slot.startTime, endTime: slot.endTime },
        token,
      );
      setReservation(res);
      setSecondsLeft(HOLD_SECONDS);
      setPhase('pending');
    } catch (err) {
      setPhase('error');
      setErrorMsg(
        (err as Error).message === 'SLOT_ALREADY_HELD'
          ? "Ce créneau vient d'être pris. Choisissez un autre."
          : (err as Error).message,
      );
    }
  };

  const handleConfirm = async () => {
    if (!reservation) return;
    try {
      const confirmed = await api.confirmReservation(reservation.id, token);
      onConfirmed(confirmed);
    } catch (err) {
      setPhase('error');
      setErrorMsg(
        (err as Error).message === 'SLOT_NO_LONGER_AVAILABLE'
          ? 'Ce créneau a été pris entre-temps. Veuillez recommencer.'
          : (err as Error).message,
      );
    }
  };

  // En phase "pending", un hold (réservation PENDING + lock Redis) existe :
  // l'annuler avant de fermer libère le créneau immédiatement (SSE slot_released),
  // sinon il reste bloqué jusqu'à expiration du lock (10 min) + cleanup job.
  const handleClose = async () => {
    if (phase === 'pending' && reservation) {
      try {
        await api.cancelReservation(reservation.id, token);
      } catch {
        // On ferme quand même : le cleanup job récupèrera la réservation expirée.
      }
    }
    onClose();
  };

  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="mb-4 text-lg font-semibold">Réservation</h2>

        <div className="mb-4 rounded-lg bg-gray-50 p-4 text-sm">
          <div>{formatHour(slot.startTime)} → {formatHour(slot.endTime)}</div>
          <div className="mt-1 text-lg font-bold text-brand-700">{totalPrice} €</div>
        </div>

        {phase === 'confirm' && (
          <>
            <p className="mb-4 text-sm text-gray-600">
              En cliquant sur "Pré-réserver", ce créneau sera bloqué 10 minutes pour vous.
            </p>
            <div className="flex gap-3">
              <button
                onClick={handleClose}
                className="flex-1 rounded-lg border px-4 py-2 text-sm hover:bg-gray-50"
              >
                Annuler
              </button>
              <button
                onClick={handleHold}
                aria-label="Pré-réserver"
                className="flex-1 rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600"
              >
                Pré-réserver
              </button>
            </div>
          </>
        )}

        {phase === 'pending' && (
          <>
            <div className="mb-4 rounded-lg bg-accent-50 p-3 text-center">
              <div className="text-sm text-accent-600">Confirmez dans</div>
              <div className="text-3xl font-bold text-accent-700">
                {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={handleClose}
                className="flex-1 rounded-lg border px-4 py-2 text-sm hover:bg-gray-50"
              >
                Abandonner
              </button>
              <button
                onClick={handleConfirm}
                aria-label="Confirmer et payer"
                className="flex-1 rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600"
              >
                Confirmer et payer
              </button>
            </div>
          </>
        )}

        {phase === 'error' && (
          <>
            <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
              {errorMsg}
            </div>
            <button
              onClick={onClose}
              className="w-full rounded-lg border px-4 py-2 text-sm hover:bg-gray-50"
            >
              Fermer
            </button>
          </>
        )}
      </div>
    </div>
  );
}
