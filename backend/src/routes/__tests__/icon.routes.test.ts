import '../../__mocks__/prisma';
import { prismaMock } from '../../__mocks__/prisma';
import request from 'supertest';
import fs from 'fs';
import sharp from 'sharp';

// Les fichiers de cache vont dans un tmpdir (jamais dans le repo pendant les tests).
jest.mock('../../utils/uploads', () => {
  const fsm = require('fs');
  const pathm = require('path');
  const osm = require('os');
  const actual = jest.requireActual('../../utils/uploads');
  const UPLOADS_DIR = fsm.mkdtempSync(pathm.join(osm.tmpdir(), 'palova-uploads-'));
  const AVATARS_DIR = pathm.join(UPLOADS_DIR, 'avatars');
  const ICONS_DIR = pathm.join(UPLOADS_DIR, 'icons');
  return {
    ...actual,
    UPLOADS_DIR, AVATARS_DIR, ICONS_DIR,
    ensureUploadDirs: () => { fsm.mkdirSync(AVATARS_DIR, { recursive: true }); fsm.mkdirSync(ICONS_DIR, { recursive: true }); },
  };
});

import { ICONS_DIR } from '../../utils/uploads';
import app from '../../app';

const CLUB = { id: 'c1', logoUrl: null as string | null, accentColor: '#d6ff3f' };

describe('GET /api/clubs/:slug/icon/:file', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    for (const f of fs.readdirSync(ICONS_DIR)) fs.unlinkSync(`${ICONS_DIR}/${f}`);
  });

  it('404 si club inconnu', async () => {
    prismaMock.club.findUnique.mockResolvedValue(null);
    const res = await request(app).get('/api/clubs/nope/icon/192.png');
    expect(res.status).toBe(404);
  });

  it('404 si variante inconnue', async () => {
    prismaMock.club.findUnique.mockResolvedValue(CLUB as any);
    const res = await request(app).get('/api/clubs/demo/icon/999.png');
    expect(res.status).toBe(404);
  });

  it('club sans logo → PNG Palova de repli, cache long', async () => {
    prismaMock.club.findUnique.mockResolvedValue(CLUB as any);
    const res = await request(app).get('/api/clubs/demo/icon/192.png');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('image/png');
    expect(res.headers['cache-control']).toContain('max-age=86400');
  });

  it('club avec logo → PNG carré généré + cache ; 2e appel sans re-téléchargement', async () => {
    prismaMock.club.findUnique.mockResolvedValue({ ...CLUB, logoUrl: 'https://logos.example/x.png' } as any);
    const logo = await sharp({ create: { width: 60, height: 40, channels: 4, background: '#ff0000' } }).png().toBuffer();
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(new Response(new Uint8Array(logo), { status: 200 }) as any);

    const res = await request(app).get('/api/clubs/demo/icon/maskable-192.png');
    expect(res.status).toBe(200);
    const meta = await sharp(res.body as Buffer).metadata();
    expect([meta.width, meta.height]).toEqual([192, 192]);
    expect(fs.readdirSync(ICONS_DIR)).toHaveLength(1);

    await request(app).get('/api/clubs/demo/icon/maskable-192.png');
    expect(fetchMock).toHaveBeenCalledTimes(1); // servi depuis le cache disque
    fetchMock.mockRestore();
  });

  it('logo injoignable → repli Palova silencieux (200)', async () => {
    prismaMock.club.findUnique.mockResolvedValue({ ...CLUB, logoUrl: 'https://logos.example/dead.png' } as any);
    const fetchMock = jest.spyOn(global, 'fetch').mockRejectedValue(new Error('boom'));
    const res = await request(app).get('/api/clubs/demo/icon/512.png');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('image/png');
    fetchMock.mockRestore();
  });
});
