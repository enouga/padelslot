'use client';
import { createContext, useContext, useEffect, useState } from 'react';
import { api, ClubDetail } from '@/lib/api';
import { ThemeProvider } from '@/lib/ThemeProvider';
import { ThemeMode } from '@/lib/theme';

interface ClubContextValue { slug: string | null; club: ClubDetail | null; loading: boolean; }
const ClubContext = createContext<ClubContextValue>({ slug: null, club: null, loading: false });

/** Reçoit le slug (lu par le layout serveur depuis l'en-tête x-club-slug),
 *  fetch le club et brande tout le sous-arbre. Slug null = plateforme. */
export function ClubProvider({ slug, children }: { slug: string | null; children: React.ReactNode }) {
  const [club, setClub] = useState<ClubDetail | null>(null);
  const [loading, setLoading] = useState<boolean>(!!slug);

  useEffect(() => {
    if (!slug) { setClub(null); setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    api.getClub(slug)
      .then((c) => { if (!cancelled) setClub(c); })
      .catch(() => { if (!cancelled) setClub(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [slug]);

  return (
    <ClubContext.Provider value={{ slug, club, loading }}>
      <ThemeProvider accent={club?.accentColor} defaultMode={club?.defaultThemeMode as ThemeMode | undefined}>
        {children}
      </ThemeProvider>
    </ClubContext.Provider>
  );
}

export function useClub(): ClubContextValue { return useContext(ClubContext); }
