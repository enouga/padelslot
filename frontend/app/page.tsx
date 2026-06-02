'use client';
import { useClub } from '@/lib/ClubProvider';
import { useTheme } from '@/lib/ThemeProvider';
import PlatformLanding from '@/components/PlatformLanding';
import ClubHome from '@/components/ClubHome';

export default function HomePage() {
  const { slug, club, loading } = useClub();
  const { th } = useTheme();
  if (!slug) return <PlatformLanding />;
  if (loading) return <div style={{ minHeight: '100vh', background: th.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: th.fontUI, color: th.textFaint }}>Chargement…</div>;
  if (!club) return <div style={{ minHeight: '100vh', background: th.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: th.fontUI, color: th.textMute }}>Club introuvable.</div>;
  return <ClubHome club={club} />;
}
