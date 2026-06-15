// Couleur déterministe par joueur / équipe : dérivée d'un seed (userId, team.id),
// jamais stockée. Même seed → même couleur, partout dans l'app.
// Texte lisible sur ces fonds via inkOn() (lib/theme.ts).

export const PLAYER_COLORS = [
  '#5e93da', // bleu
  '#ff7a4d', // corail
  '#2bb6a3', // turquoise
  '#9b8cf0', // violet
  '#ef6f9e', // rose
  '#5bbd6e', // vert
  '#e6a93c', // ambre
  '#7b7fe0', // indigo
] as const;

// Hash FNV-1a 32 bits : stable, bien distribué, sans dépendance.
function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Couleur stable de la palette pour un seed donné (seed vide → première couleur). */
export function colorForSeed(seed: string): string {
  if (!seed) return PLAYER_COLORS[0];
  return PLAYER_COLORS[fnv1a(seed) % PLAYER_COLORS.length];
}
