import { api, Court } from '@/lib/api';
import { CourtsView } from './CourtsView';

const CLUB_ID = 'club-demo';

export default async function CourtsPage() {
  let courts: Court[] = [];
  try {
    courts = await api.getCourts(CLUB_ID);
  } catch {
    return (
      <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <p style={{ fontFamily: 'var(--font-ui), sans-serif', color: '#ff7a4d' }}>
          Impossible de charger les terrains.
        </p>
      </main>
    );
  }

  const clubName = courts[0]?.club.name ?? 'SlotPadel';
  return <CourtsView courts={courts} clubName={clubName} />;
}
