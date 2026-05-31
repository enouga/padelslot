'use client';
import { useState, useEffect } from 'react';
import { UserRole } from './api';

interface AuthState {
  token: string | null;
  role: UserRole | null;
  clubId: string | null;
  ready: boolean; // true une fois la lecture localStorage effectuée (évite le flash SSR)
}

/**
 * Lit token/role/clubId depuis localStorage au montage.
 * NB : ce rôle sert uniquement au gating UX — la sécurité réelle est garantie
 * côté backend (requireClubAdmin). Ne jamais s'y fier pour une décision sensible.
 */
export function useAuth(): AuthState {
  const [state, setState] = useState<AuthState>({
    token: null, role: null, clubId: null, ready: false,
  });

  useEffect(() => {
    const token  = localStorage.getItem('token');
    const role   = localStorage.getItem('role') as UserRole | null;
    const clubId = localStorage.getItem('clubId');
    setState({
      token,
      role,
      clubId: clubId || null,
      ready: true,
    });
  }, []);

  return state;
}
