import '../../__mocks__/prisma';
import { prismaMock } from '../../__mocks__/prisma';
import request from 'supertest';
import jwt from 'jsonwebtoken';

// Les fichiers uploadés vont dans un tmpdir (jamais dans le repo pendant les tests).
jest.mock('../../utils/uploads', () => {
  const fsm = require('fs');
  const pathm = require('path');
  const osm = require('os');
  const actual = jest.requireActual('../../utils/uploads');
  const UPLOADS_DIR = fsm.mkdtempSync(pathm.join(osm.tmpdir(), 'palova-logos-'));
  const LOGOS_DIR = pathm.join(UPLOADS_DIR, 'logos');
  return {
    ...actual,
    UPLOADS_DIR, LOGOS_DIR,
    ensureUploadDirs: () => { fsm.mkdirSync(LOGOS_DIR, { recursive: true }); },
  };
});

import app from '../../app';

const SECRET = process.env.JWT_SECRET!;
if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET manquant dans l environnement de test (.env)');
const token = jwt.sign({ id: 'admin-1', email: 'a@x.fr' }, SECRET, { expiresIn: '1h' });
const url = '/api/clubs/club-demo/admin/club-logo';
const asMember = (role = 'OWNER') => prismaMock.clubMember.findUnique.mockResolvedValue({ role } as any);

describe('POST /api/clubs/:clubId/admin/club-logo', () => {
  beforeEach(() => { jest.clearAllMocks(); });

  it('200 enregistre le logo et renvoie un chemin /uploads/logos/...', async () => {
    asMember();
    prismaMock.club.findUnique.mockResolvedValue({ logoUrl: null } as any);
    prismaMock.club.update.mockResolvedValue({ id: 'club-demo' } as any);

    const res = await request(app).post(url)
      .set('Authorization', `Bearer ${token}`)
      .attach('logo', Buffer.from([0x89, 0x50, 0x4e, 0x47]), 'logo.png');

    expect(res.status).toBe(200);
    expect(res.body.logoUrl).toMatch(/^\/uploads\/logos\/club-demo-\d+\.png$/);
    expect(prismaMock.club.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'club-demo' },
      data: expect.objectContaining({ logoUrl: res.body.logoUrl }),
    }));
  });

  it('400 si le format n est pas une image supportée', async () => {
    asMember();
    const res = await request(app).post(url)
      .set('Authorization', `Bearer ${token}`)
      .attach('logo', Buffer.from('coucou'), 'note.txt');
    expect(res.status).toBe(400);
  });

  it('403 si l utilisateur n est pas membre du club', async () => {
    prismaMock.clubMember.findUnique.mockResolvedValue(null as any);
    const res = await request(app).post(url)
      .set('Authorization', `Bearer ${token}`)
      .attach('logo', Buffer.from([0x89, 0x50, 0x4e, 0x47]), 'logo.png');
    expect(res.status).toBe(403);
  });
});
