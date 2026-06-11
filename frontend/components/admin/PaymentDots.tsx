'use client';
import { useTheme } from '@/lib/ThemeProvider';
import type { PaymentDotsModel } from '@/lib/caisse';

/** Vert « soldé » des pastilles de paiement. */
export const SETTLED_COLOR = '#34b888';

/**
 * Rangée de pastilles de paiement d'un bloc du planning : 1 point plein par
 * paiement reçu, points vides jusqu'au nombre de joueurs ; tout vert + ✓ quand
 * la réservation est soldée, « +n » si plus de paiements que de places.
 */
export function PaymentDots({ dots, color }: { dots: PaymentDotsModel; color: string }) {
  const { th } = useTheme();
  const fill = dots.settled ? SETTLED_COLOR : color;
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 3, height: 10 }}>
      {Array.from({ length: dots.slots }, (_, i) => {
        const on = dots.settled || i < dots.filled;
        return (
          <span key={i} style={{ width: 6, height: 6, borderRadius: '50%', boxSizing: 'border-box', background: on ? fill : 'transparent', border: on ? 'none' : `1px solid ${th.textFaint}` }} />
        );
      })}
      {dots.overflow > 0 && <span style={{ fontFamily: th.fontMono, fontSize: 9, color: th.textMute, lineHeight: 1 }}>+{dots.overflow}</span>}
      {dots.settled && <span style={{ fontSize: 9, fontWeight: 700, color: SETTLED_COLOR, lineHeight: 1 }}>✓</span>}
    </span>
  );
}
