'use client';
import { ReactNode } from 'react';
import { useTheme } from '@/lib/ThemeProvider';
import { Btn } from './atoms';

interface ConfirmDialogProps {
  title: string;
  /** Ligne de contexte mise en avant (ex. « Terrain 3 · sam. 15h00 »). */
  detail?: ReactNode;
  /** Explication / conséquence de l'action. */
  message?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Désactive les boutons et l'overlay pendant la requête. */
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Confirmation bottom-sheet thémée, calquée sur le BookingModal.
 * Le bouton d'action est en variante `danger` (action destructive).
 */
export function ConfirmDialog({
  title, detail, message, confirmLabel = 'Confirmer', cancelLabel = 'Retour',
  busy = false, onConfirm, onCancel,
}: ConfirmDialogProps) {
  const { th } = useTheme();
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 95, display: 'flex', flexDirection: 'column', justifyContent: 'flex-start' }}>
      <div onClick={busy ? undefined : onCancel} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(2px)', animation: 'sp-fade .25s ease' }} />
      <div role="dialog" aria-modal="true" style={{ position: 'relative', width: '100%', maxWidth: 480, margin: '0 auto', background: th.bgElev, borderRadius: '0 0 28px 28px', padding: '12px 20px 36px', boxShadow: '0 10px 40px rgba(0,0,0,0.3)', animation: 'sp-sheet-in-top .34s cubic-bezier(.2,.8,.2,1)' }}>
        <div style={{ fontFamily: th.fontDisplay, fontWeight: 600, fontSize: 26, color: th.text, letterSpacing: -0.3 }}>{title}</div>
        {detail && (
          <div style={{ fontFamily: th.fontUI, fontSize: 14.5, fontWeight: 600, color: th.text, marginTop: 14, background: th.surface2, borderRadius: 14, padding: '13px 16px' }}>{detail}</div>
        )}
        {message && (
          <div style={{ fontFamily: th.fontUI, fontSize: 13.5, color: th.textMute, marginTop: 14, lineHeight: 1.45 }}>{message}</div>
        )}
        <div style={{ display: 'flex', gap: 11, marginTop: 24 }}>
          <Btn variant="surface" onClick={onCancel} disabled={busy} style={{ flex: '0 0 42%' }}>{cancelLabel}</Btn>
          <Btn variant="danger" onClick={onConfirm} disabled={busy} style={{ flex: 1 }}>{busy ? '…' : confirmLabel}</Btn>
        </div>
        <div style={{ width: 38, height: 5, borderRadius: 3, background: th.lineStrong, margin: '18px auto 0' }} />
      </div>
    </div>
  );
}
