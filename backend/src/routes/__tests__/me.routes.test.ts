import '../../__mocks__/prisma';
import { prismaMock } from '../../__mocks__/prisma';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';

// Les uploads écrivent dans un tmpdir (jamais dans le dossier du repo pendant les tests).
jest.mock('../../utils/uploads', () => {
  const fsm = require('fs');
  const pathm = require('path');
  const osm = require('os');
  const actual = jest.requireActual('../../utils/uploads');
  const UPLOADS_DIR = fsm.mkdtempSync(pathm.join(osm.tmpdir(), 'palova-uploads-'));
  const AVATARS_DIR = pathm.join(UPLOADS_DIR, 'avatars');
  return {
    ...actual,
    UPLOADS_DIR,
    AVATARS_DIR,
    ensureUploadDirs: () => fsm.mkdirSync(AVATARS_DIR, { recursive: true }),
  };
});

import { AVATARS_DIR } from '../../utils/uploads';
import app from '../../app';

if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET manquant dans l environnement de test (.env)');

const token = () => jwt.sign({ id: 'u1', email: 'test@x.fr' }, process.env.JWT_SECRET!);
const PROFILE = {
  id: 'u1', email: 'test@x.fr', firstName: 'Eric', lastName: 'Nougayrede', phone: null, sex: null,
  birthDate: null, avatarUrl: null, locale: 'fr', isSuperAdmin: false,
};

// PNG 1x1 minimal (entête valide suffisante : le backend ne décode pas l'image).
const PNG = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000', 'hex');

describe('PATCH /api/me', () => {
  it('rejette un sexe invalide (400)', async () => {
    const res = await request(app).patch('/api/me').set('Authorization', `Bearer ${token()}`).send({ sex: 'X' });
    expect(res.status).toBe(400);
  });

  it.each(['31-12-1990', '2026-02-30', '1990-13-01', 'abcd'])('rejette birthDate invalide « %s » (400)', async (birthDate) => {
    const res = await request(app).patch('/api/me').set('Authorization', `Bearer ${token()}`).send({ birthDate });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('birthDate invalide');
  });

  it('rejette une locale hors liste (400)', async () => {
    const res = await request(app).patch('/api/me').set('Authorization', `Bearer ${token()}`).send({ locale: 'de' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('locale invalide');
  });

  it('met à jour téléphone, date de naissance et locale', async () => {
    prismaMock.user.update.mockResolvedValue({ ...PROFILE, phone: '0609032635', birthDate: new Date('1973-07-08'), locale: 'en' } as any);
    const res = await request(app).patch('/api/me').set('Authorization', `Bearer ${token()}`)
      .send({ phone: ' 0609032635 ', birthDate: '1973-07-08', locale: 'en' });
    expect(res.status).toBe(200);
    expect(prismaMock.user.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'u1' },
      data: { phone: '0609032635', birthDate: new Date('1973-07-08'), locale: 'en' },
    }));
  });

  it('efface la date de naissance avec null', async () => {
    prismaMock.user.update.mockResolvedValue(PROFILE as any);
    const res = await request(app).patch('/api/me').set('Authorization', `Bearer ${token()}`).send({ birthDate: null });
    expect(res.status).toBe(200);
    expect(prismaMock.user.update).toHaveBeenCalledWith(expect.objectContaining({ data: { birthDate: null } }));
  });
});

describe('POST /api/me/avatar', () => {
  it('refuse sans token (401)', async () => {
    const res = await request(app).post('/api/me/avatar').attach('avatar', PNG, { filename: 'a.png', contentType: 'image/png' });
    expect(res.status).toBe(401);
  });

  it('refuse un format non supporté (400)', async () => {
    const res = await request(app).post('/api/me/avatar').set('Authorization', `Bearer ${token()}`)
      .attach('avatar', PNG, { filename: 'a.gif', contentType: 'image/gif' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Format');
  });

  it('enregistre la photo, met à jour avatarUrl et supprime l\'ancienne', async () => {
    const oldName = 'u1-1000.jpg';
    fs.mkdirSync(AVATARS_DIR, { recursive: true });
    fs.writeFileSync(path.join(AVATARS_DIR, oldName), 'old');
    prismaMock.user.findUnique.mockResolvedValue({ avatarUrl: `/uploads/avatars/${oldName}` } as any);
    prismaMock.user.update.mockImplementation((args: any) => Promise.resolve({ ...PROFILE, avatarUrl: args.data.avatarUrl }) as any);

    const res = await request(app).post('/api/me/avatar').set('Authorization', `Bearer ${token()}`)
      .attach('avatar', PNG, { filename: 'photo.png', contentType: 'image/png' });

    expect(res.status).toBe(200);
    expect(res.body.avatarUrl).toMatch(/^\/uploads\/avatars\/u1-\d+\.png$/);
    const written = path.join(AVATARS_DIR, path.basename(res.body.avatarUrl));
    expect(fs.existsSync(written)).toBe(true);
    // L'unlink de l'ancienne photo est asynchrone best-effort : on lui laisse un tick.
    await new Promise((r) => setTimeout(r, 50));
    expect(fs.existsSync(path.join(AVATARS_DIR, oldName))).toBe(false);
  });
});
