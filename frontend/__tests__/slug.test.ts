import { slugify } from '../lib/slug';

describe('slugify (miroir backend)', () => {
  it('minuscules, accents enlevés, tirets', () => {
    expect(slugify('Pâdel Çlub  Paris!')).toBe('padel-club-paris');
  });
  it('tronque à 60 et nettoie les tirets de bord', () => {
    expect(slugify('---Hello---')).toBe('hello');
    expect(slugify('a'.repeat(80))).toHaveLength(60);
  });
  it('vide si aucun caractère valide', () => {
    expect(slugify('!!!')).toBe('');
  });
  it('pas de tiret final quand la coupe à 60 tombe sur un tiret', () => {
    const out = slugify('a'.repeat(59) + ' b');
    expect(out).toBe('a'.repeat(59));
    expect(out.endsWith('-')).toBe(false);
  });
});
