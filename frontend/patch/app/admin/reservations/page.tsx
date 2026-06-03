'use client';
import { useState, useEffect, useCallback } from 'react';
import { api, AdminCourt, ClubReservation, AdminReservationFilters } from '@/lib/api';
import { useAuth } from '@/lib/useAuth';

function getTodayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatHour(iso: string): string {
  const d = new Date(iso);
  const h = (d.getUTCHours() + 2) % 24; // Paris = UTC+2 (été)
  const m = d.getUTCMinutes();
  return `${String(h).padStart(2, '0')}h${String(m).padStart(2, '0')}`;
}

type StatusFilter = '' | 'PENDING' | 'CONFIRMED' | 'CANCELLED';

const STATUS_META: Record<ClubReservation['status'], { label: string; cls: string }> = {
  CONFIRMED: { label: 'Confirmée',  cls: 'bg-green-100 text-green-700' },
  PENDING:   { label: 'En attente', cls: 'bg-accent-100 text-accent-700' },
  CANCELLED: { label: 'Annulée',    cls: 'bg-gray-200 text-gray-500' },
};

export default function AdminReservationsPage() {
  const { token, ready } = useAuth();

  const [courts, setCourts]             = useState<AdminCourt[]>([]);
  const [reservations, setReservations] = useState<ClubReservation[]>([]);
  const [summary, setSummary]           = useState<{ total: string; paidTotal: string }>({ total: '0', paidTotal: '0' });
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState<string | null>(null);

  const [date, setDate]     = useState(getTodayDate());
  const [courtId, setCourtId] = useState('');
  const [status, setStatus]   = useState<StatusFilter>('');

  // Liste des terrains pour le filtre (une seule fois).
  useEffect(() => {
    if (!ready || !token) return;
    api.adminGetCourts(token).then(setCourts).catch(() => { /* filtre terrain optionnel */ });
  }, [ready, token]);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      setError(null);
      const filters: AdminReservationFilters = {};
      if (date)    filters.date = date;
      if (courtId) filters.courtId = courtId;
      if (status)  filters.status = status;
      const data = await api.adminGetReservations(filters, token);
      setReservations(data.reservations);
      setSummary(data.summary);
    } catch (e) {
      setReservations([]);
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [token, date, courtId, status]);

  useEffect(() => { if (ready && token) load(); }, [ready, token, load]);

  const cancel = async (r: ClubReservation) => {
    if (!token) return;
    if (!confirm(`Annuler la réservation de ${r.user.firstName} ${r.user.lastName} (${formatHour(r.startTime)}) ?`)) return;
    try {
      setError(null);
      await api.adminCancelReservation(r.id, token);
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-gray-800">Réservations</h1>

      {/* Récap encaissement */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border bg-white p-5">
          <div className="text-sm text-gray-500">Montant réservé</div>
          <div className="mt-1 text-3xl font-bold text-brand-700">{Number(summary.total).toFixed(2)} €</div>
        </div>
        <div className="rounded-2xl border bg-white p-5">
          <div className="text-sm text-gray-500">Encaissé (confirmées)</div>
          <div className="mt-1 text-3xl font-bold text-accent-600">{Number(summary.paidTotal).toFixed(2)} €</div>
        </div>
      </div>

      {/* Filtres */}
      <div className="mb-6 flex flex-wrap items-end gap-3">
        <label className="text-sm text-gray-600">Date
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
            className="mt-1 block rounded-lg border px-3 py-2 text-sm" />
        </label>
        <label className="text-sm text-gray-600">Terrain
          <select value={courtId} onChange={(e) => setCourtId(e.target.value)}
            className="mt-1 block rounded-lg border px-3 py-2 text-sm">
            <option value="">Tous les terrains</option>
            {courts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label className="text-sm text-gray-600">Statut
          <select value={status} onChange={(e) => setStatus(e.target.value as StatusFilter)}
            className="mt-1 block rounded-lg border px-3 py-2 text-sm">
            <option value="">Tous</option>
            <option value="CONFIRMED">Confirmées</option>
            <option value="PENDING">En attente</option>
            <option value="CANCELLED">Annulées</option>
          </select>
        </label>
        <button onClick={load}
          className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600">
          Actualiser
        </button>
      </div>

      {error && <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      {loading ? (
        <div className="py-8 text-gray-400">Chargement…</div>
      ) : reservations.length === 0 ? (
        <div className="rounded-2xl border border-dashed bg-white py-16 text-center text-gray-400">
          Aucune réservation pour ces filtres.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border bg-white">
          <table className="w-full text-sm">
            <thead className="border-b bg-gray-50 text-left text-gray-500">
              <tr>
                <th className="px-4 py-3">Horaire</th>
                <th className="px-4 py-3">Terrain</th>
                <th className="px-4 py-3">Client</th>
                <th className="px-4 py-3">Statut</th>
                <th className="px-4 py-3 text-right">Montant</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {reservations.map((r) => {
                const meta = STATUS_META[r.status];
                return (
                  <tr key={r.id} className="border-b last:border-0">
                    <td className="px-4 py-3 font-medium text-gray-800 whitespace-nowrap">
                      {formatHour(r.startTime)} → {formatHour(r.endTime)}
                    </td>
                    <td className="px-4 py-3 text-gray-700">{r.court.name}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-800">{r.user.firstName} {r.user.lastName}</div>
                      <div className="text-xs text-gray-400">{r.user.email}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-3 py-1 text-xs font-medium ${meta.cls}`}>{meta.label}</span>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-800 whitespace-nowrap">
                      {Number(r.totalPrice).toFixed(2)} €
                    </td>
                    <td className="px-4 py-3 text-right">
                      {r.status !== 'CANCELLED' && (
                        <button onClick={() => cancel(r)}
                          className="rounded-lg border border-red-200 px-3 py-1 text-xs font-medium text-red-600 hover:bg-red-50">
                          Annuler
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
