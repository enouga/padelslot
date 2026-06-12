'use client';
import { useEffect, useState } from 'react';
import { InstallState, installState, isIosUa } from '@/lib/install';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

// Capture beforeinstallprompt (Chrome/Edge), détecte iOS et le mode standalone,
// expose l'état d'éligibilité + le déclencheur du prompt natif.
export function useInstallPrompt(): { state: InstallState; promptInstall: () => void } {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [env, setEnv] = useState({ standalone: false, ios: false, installed: false });

  useEffect(() => {
    setEnv({
      standalone: window.matchMedia('(display-mode: standalone)').matches
        || (navigator as unknown as { standalone?: boolean }).standalone === true,
      ios: isIosUa(navigator.userAgent, navigator.maxTouchPoints > 1),
      installed: false,
    });
    const onPrompt = (e: Event) => { e.preventDefault(); setDeferred(e as BeforeInstallPromptEvent); };
    const onInstalled = () => setEnv((s) => ({ ...s, installed: true }));
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const state: InstallState = env.installed
    ? 'hidden'
    : installState({ standalone: env.standalone, canPrompt: deferred != null, ios: env.ios });
  const promptInstall = () => { deferred?.prompt(); setDeferred(null); };
  return { state, promptInstall };
}
