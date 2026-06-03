import { api, Court } from '@/lib/api';
import Link from 'next/link';
import Logo from '@/components/Logo';

const CLUB_ID = 'club-demo';

export default async function CourtsPage() {
  let courts: Court[] = [];
  try {
    courts = await api.getCourts(CLUB_ID);
  } catch {
    return (
      <main className="mx-auto max-w-2xl p-6">
        <p className="text-red-600">Impossible de charger les terrains.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-6">
      <header className="mb-8 flex items-center justify-between">
        <Logo size={30} />
      </header>

      <p className="mb-1 font-mono text-[11px] uppercase tracking-[0.18em] text-mute">
        {courts[0]?.club.name ?? 'Club'}
      </p>
      <h1 className="mb-7 font-display text-3xl font-semibold text-ink">Choisissez votre terrain</h1>

      <div className="grid gap-4">
        {courts.map((court) => (
          <Link
            key={court.id}
            href={`/courts/${court.id}`}
            className="flex items-center justify-between rounded-2xl border border-ink/10 bg-card p-5 transition-shadow hover:shadow-md"
          >
            <div>
              <div className="font-semibold text-ink">{court.name}</div>
              <div className="text-sm capitalize text-mute">{court.surface}</div>
            </div>
            <div className="text-right">
              <div className="font-bold text-brand-600">{court.pricePerHour} €/h</div>
              <div className="font-mono text-xs text-faint">{court.openHour}h – {court.closeHour}h</div>
            </div>
          </Link>
        ))}
      </div>
    </main>
  );
}
