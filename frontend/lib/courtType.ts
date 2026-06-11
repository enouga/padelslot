import { IconName } from '@/components/ui/Icon';

/** Surface du terrain (attributes.surface) : indoor / outdoor. */
export function courtType(surface?: string): { label: string; icon: IconName; color: string } {
  return surface === 'outdoor'
    ? { label: 'Outdoor', icon: 'sun', color: '#ef9f6a' }     // apricot (soleil)
    : { label: 'Indoor', icon: 'indoor', color: '#5e93da' };  // bleu Palova
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

export const SURFACE_TYPES = [
  { value: 'indoor', label: 'Indoor' },
  { value: 'outdoor', label: 'Outdoor' },
] as const;

export const COURT_FORMATS = [
  { value: 'double', label: 'Double' },
  { value: 'single', label: 'Single' },
] as const;
