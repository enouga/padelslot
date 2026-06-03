'use client';
import { useState, useEffect, useCallback } from 'react';
import { api, AdminCourt } from '@/lib/api';
import { useAuth } from '@/lib/useAuth';

export default function AdminCourtsPage() {
  const { token, ready } = useAuth();
  const [courts, setCourts]   = useState<AdminCourt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  const [newCourt, setNewCourt] = useState({ name: '', surface: 'indoor', pricePerHour: '25', openHour: '8', closeHour: '22' });
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      setError(null);
      setCourts(await api.adminGetCourts(token));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { if (ready && token) load(); }, [ready, token, load]);

  // Édition en place d'un champ d'un terrain.
  const editField = (id: string, field: keyof AdminCourt, value: string | number) => {
    setCourts((prev) => prev.map((c) => (c.id === id ? { ...c, [field]: value } : c)));
  };

  const saveCourt = async (court: AdminCourt) => {
    if (!token) return;
    try {
      setError(null);
      await api.adminUpdateCourt(court.id, {
        pricePerHour: Number(court.pricePerHour),
        openHour:     Number(court.openHour),
        closeHour:    Number(court.closeHour),
      }, token);
      await load();
    } catch (e) {
      setError(`Terrain ${court.name} : ${(e as Error).message}`);
    }
  };

  const toggleActive = async (court: AdminCourt) => {
    if (!token) return;
    try {
      setError(null);
      await api.adminSetCourtActive(court.id, !court.isActive, token);
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const createCourt = async () => {
    if (!token) return;
    setCreating(true);
    try {
      setError(null);
      await api.adminCreateCourt({
        name:         newCourt.name,
        surface:      newCourt.surface,
        pricePerHour: Number(newCourt.pricePerHour),
        openHour:     Number(newCourt.openHour),
        closeHour:    Number(newCourt.closeHour),
      }, token);
      setNewCourt({ name: '', surface: 'indoor', pricePerHour: '25', openHour: '8', closeHour: '22' });
      await load();
    } catch (e) {
      setError(`Création : ${(e as Error).message === 'VALIDATION_ERROR' ? 'champs invalides (tarif > 0, ouverture < fermeture)' : (e as Error).message}`);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-gray-800">Terrains</h1>

      {error && <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      {loading ? (
        <div className="py-8 text-gray-400">Chargement…</div>
      ) : (
        <div className="mb-8 overflow-x-auto rounded-2xl border bg-white">
          <table className="w-full text-sm">
            <thead className="border-b bg-gray-50 text-left text-gray-500">
              <tr>
                <th className="px-4 py-3">Terrain</th>
                <th className="px-4 py-3">Tarif €/h</th>
                <th className="px-4 py-3">Ouverture</th>
                <th className="px-4 py-3">Fermeture</th>
                <th className="px-4 py-3">Statut</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {courts.map((c) => (
                <tr key={c.id} className={`border-b last:border-0 ${c.isActive ? '' : 'opacity-50'}`}>
                  <td className="px-4 py-3 font-medium text-gray-800">{c.name}<div className="text-xs text-gray-400">{c.surface}</div></td>
                  <td className="px-4 py-3">
                    <input type="number" min={1} step="0.5" value={c.pricePerHour}
                      onChange={(e) => editField(c.id, 'pricePerHour', e.target.value)}
                      className="w-20 rounded border px-2 py-1" />
                  </td>
                  <td className="px-4 py-3">
                    <input type="number" min={0} max={24} value={c.openHour}
                      onChange={(e) => editField(c.id, 'openHour', e.target.value)}
                      className="w-16 rounded border px-2 py-1" />
                  </td>
                  <td className="px-4 py-3">
                    <input type="number" min={0} max={24} value={c.closeHour}
                      onChange={(e) => editField(c.id, 'closeHour', e.target.value)}
                      className="w-16 rounded border px-2 py-1" />
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => toggleActive(c)}
                      className={`rounded-full px-3 py-1 text-xs font-medium ${c.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-600'}`}>
                      {c.isActive ? 'Actif' : 'Inactif'}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => saveCourt(c)}
                      className="rounded-lg bg-brand-500 px-3 py-1 text-xs font-medium text-white hover:bg-brand-600">
                      Enregistrer
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="rounded-2xl border bg-white p-6">
        <h2 className="mb-4 text-lg font-semibold text-gray-800">Ajouter un terrain</h2>
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm">Nom
            <input value={newCourt.name} onChange={(e) => setNewCourt({ ...newCourt, name: e.target.value })}
              className="mt-1 block w-44 rounded border px-2 py-1" placeholder="Terrain 4" />
          </label>
          <label className="text-sm">Surface
            <select value={newCourt.surface} onChange={(e) => setNewCourt({ ...newCourt, surface: e.target.value })}
              className="mt-1 block rounded border px-2 py-1">
              <option value="indoor">indoor</option>
              <option value="outdoor">outdoor</option>
            </select>
          </label>
          <label className="text-sm">Tarif €/h
            <input type="number" min={1} step="0.5" value={newCourt.pricePerHour} onChange={(e) => setNewCourt({ ...newCourt, pricePerHour: e.target.value })}
              className="mt-1 block w-24 rounded border px-2 py-1" />
          </label>
          <label className="text-sm">Ouv.
            <input type="number" min={0} max={24} value={newCourt.openHour} onChange={(e) => setNewCourt({ ...newCourt, openHour: e.target.value })}
              className="mt-1 block w-16 rounded border px-2 py-1" />
          </label>
          <label className="text-sm">Ferm.
            <input type="number" min={0} max={24} value={newCourt.closeHour} onChange={(e) => setNewCourt({ ...newCourt, closeHour: e.target.value })}
              className="mt-1 block w-16 rounded border px-2 py-1" />
          </label>
          <button onClick={createCourt} disabled={creating || !newCourt.name.trim()}
            className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50">
            {creating ? 'Création…' : 'Créer'}
          </button>
        </div>
      </div>
    </div>
  );
}
