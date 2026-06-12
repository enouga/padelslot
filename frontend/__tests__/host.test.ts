import { clubSlugFromHost } from '../lib/host';

describe('clubSlugFromHost', () => {
  it.each([
    ['localhost:3000', 'localhost', null],
    ['palova.fr', 'palova.fr', null],
    ['www.palova.fr', 'palova.fr', null],
    ['app.palova.fr', 'palova.fr', null],
    ['demo.palova.fr', 'palova.fr', 'demo'],
    ['demo.palova.fr:443', 'palova.fr', 'demo'],
    // 1er label seulement, et www/app filtrés — comportement actuel du proxy conservé.
    ['www.demo.palova.fr', 'palova.fr', null],
    ['autresite.com', 'palova.fr', null],
    ['', 'palova.fr', null],
  ] as Array<[string, string, string | null]>)('host %s (root %s) → %s', (host, root, expected) => {
    expect(clubSlugFromHost(host, root)).toBe(expected);
  });

  it('demo.localhost:3000 → demo (dev local)', () => {
    expect(clubSlugFromHost('demo.localhost:3000', 'localhost')).toBe('demo');
  });
});
