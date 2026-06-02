'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
export default function LegacyClubRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace('/reserver'); }, [router]);
  return null;
}
