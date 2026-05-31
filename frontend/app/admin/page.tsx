'use client';
import Link from 'next/link';

export default function AdminDashboard() {
  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-gray-800">Tableau de bord</h1>
      <div className="grid gap-4 sm:grid-cols-2">
        <Link
          href="/admin/courts"
          className="rounded-2xl border bg-white p-6 shadow-sm transition hover:shadow-md"
        >
          <h2 className="mb-1 text-lg font-semibold text-gray-800">Terrains</h2>
          <p className="text-sm text-gray-500">Tarifs, horaires, création et activation des terrains.</p>
        </Link>
        <Link
          href="/admin/reservations"
          className="rounded-2xl border bg-white p-6 shadow-sm transition hover:shadow-md"
        >
          <h2 className="mb-1 text-lg font-semibold text-gray-800">Réservations</h2>
          <p className="text-sm text-gray-500">Planning du club, montants encaissés, annulations.</p>
        </Link>
      </div>
    </div>
  );
}
