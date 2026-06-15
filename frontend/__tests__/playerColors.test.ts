import { PLAYER_COLORS, colorForSeed } from '../lib/playerColors';

describe('colorForSeed', () => {
  it('est déterministe : même seed → même couleur', () => {
    expect(colorForSeed('user-42')).toBe(colorForSeed('user-42'));
  });

  it('renvoie toujours une couleur de la palette', () => {
    for (const seed of ['a', 'user-1', 'team-xyz', '', 'Δ', '99999']) {
      expect(PLAYER_COLORS).toContain(colorForSeed(seed));
    }
  });

  it('seed vide → première couleur (stable, pas d’exception)', () => {
    expect(colorForSeed('')).toBe(PLAYER_COLORS[0]);
  });

  it('distribue : au moins 3 couleurs distinctes sur 8 seeds variés', () => {
    const seeds = ['u1', 'u2', 'u3', 'u4', 'u5', 'u6', 'u7', 'u8'];
    const distinct = new Set(seeds.map(colorForSeed));
    expect(distinct.size).toBeGreaterThanOrEqual(3);
  });
});
