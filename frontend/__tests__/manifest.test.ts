import { buildManifest, shortName } from '../lib/manifest';

describe('shortName', () => {
  it('garde un nom court tel quel', () => expect(shortName('Palova')).toBe('Palova'));
  it('tronque à 12 caractères avec ellipse', () => {
    const s = shortName('Padel Arena Paris Quinze');
    expect(s.length).toBeLessThanOrEqual(12);
    expect(s.endsWith('…')).toBe(true);
  });
});

describe('buildManifest', () => {
  const club = { slug: 'demo', name: 'Padel Arena Paris', accentColor: '#ff7849', logoUrl: 'https://x/logo.png' };

  it('plateforme (club null) → identité Palova, icônes statiques any + maskable', () => {
    const m = buildManifest(null);
    expect(m.name).toBe('Palova');
    expect(m.start_url).toBe('/');
    expect(m.display).toBe('standalone');
    expect(m.icons.map((i) => i.src)).toEqual([
      '/icon-192.png', '/icon-512.png', '/icon-maskable-192.png', '/icon-maskable-512.png',
    ]);
    expect(m.icons.filter((i) => i.purpose === 'maskable')).toHaveLength(2);
  });

  it('club avec logo → nom/couleur du club, icônes servies par le backend', () => {
    const m = buildManifest(club);
    expect(m.name).toBe('Padel Arena Paris');
    expect(m.short_name.length).toBeLessThanOrEqual(12);
    expect(m.theme_color).toBe('#ff7849');
    expect(m.icons[0].src).toBe('http://localhost:3001/api/clubs/demo/icon/192.png');
    expect(m.icons.map((i) => i.src)).toContain('http://localhost:3001/api/clubs/demo/icon/maskable-512.png');
  });

  it('club sans logo → nom du club mais icônes Palova', () => {
    const m = buildManifest({ ...club, logoUrl: null });
    expect(m.name).toBe('Padel Arena Paris');
    expect(m.icons[0].src).toBe('/icon-192.png');
  });
});
