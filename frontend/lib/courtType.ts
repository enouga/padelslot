import { IconName } from '@/components/ui/Icon';

/** Couvert / découvert (attributes.covered). */
export function coveredType(covered?: boolean): { label: string; icon: IconName; color: string } {
  return covered
    ? { label: 'Couvert', icon: 'indoor', color: '#5e93da' }   // bleu Palova
    : { label: 'Découvert', icon: 'sun', color: '#ef9f6a' };    // apricot (soleil)
}

/** Format du terrain (attributes.format) : double (standard) / single (2 joueurs). */
export function courtFormat(format?: string): string | null {
  return format === 'single' ? 'Single' : null; // on n'affiche un badge que pour les single
}

/** Couleur du badge format « single » (violet). */
export const SINGLE_COLOR = '#bda6ff';

/** Nombre de joueurs selon le format du terrain (attributes.format). */
export function playerCount(format?: string): number {
  return format === 'single' ? 2 : 4;
}

export const COURT_FORMATS = [
  { value: 'double', label: 'Double' },
  { value: 'single', label: 'Single' },
] as const;
