'use client';
import { ClubDetail } from '@/lib/api';
import { useRouter } from 'next/navigation';
import { Screen } from '@/components/ui/Screen';
import { Btn } from '@/components/ui/atoms';
export default function ClubHome({ club }: { club: ClubDetail }) {
  const router = useRouter();
  return (
    <Screen>
      <div style={{ padding: 24 }}>
        <h1>{club.name}</h1>
        <Btn full icon="arrowR" onClick={() => router.push('/reserver')}>Réserver</Btn>
      </div>
    </Screen>
  );
}
