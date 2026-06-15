import '../../__mocks__/prisma';
import { prismaMock } from '../../__mocks__/prisma';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { Prisma } from '@prisma/client';
import app from '../../app';

const SECRET = process.env.JWT_SECRET!;
if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET manquant dans l environnement de test (.env)');
const superToken = jwt.sign({ id: 'admin', email: 'a@x.fr' }, SECRET, { expiresIn: '1h' });
const asSuper = () => prismaMock.user.findUnique.mockResolvedValue({ isSuperAdmin: true } as any);

describe('POST /api/platform/sports', () => {
  it('201 crée un sport, clé auto-dérivée du nom', async () => {
    asSuper();
    prismaMock.sport.create.mockResolvedValue({ id: 's1', key: 'beach-tennis', name: 'Beach Tennis' } as any);
    const res = await request(app).post('/api/platform/sports').set('Authorization', `Bearer ${superToken}`)
      .send({ name: 'Beach Tennis', resourceNoun: 'terrain', defaultDurationsMin: [60, 90], surfaces: ['Sable'] });
    expect(res.status).toBe(201);
    expect(prismaMock.sport.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ key: 'beach-tennis', name: 'Beach Tennis', surfaces: ['Sable'], defaultDurationsMin: [60, 90] }),
    }));
  });

  it('409 SPORT_KEY_TAKEN sur clé dupliquée', async () => {
    asSuper();
    prismaMock.sport.create.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' }));
    const res = await request(app).post('/api/platform/sports').set('Authorization', `Bearer ${superToken}`)
      .send({ name: 'Padel', defaultDurationsMin: [90] });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('SPORT_KEY_TAKEN');
  });

  it('400 VALIDATION_ERROR si durées vides', async () => {
    asSuper();
    const res = await request(app).post('/api/platform/sports').set('Authorization', `Bearer ${superToken}`)
      .send({ name: 'X', defaultDurationsMin: [] });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
  });

  it('403 pour un non super-admin', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ isSuperAdmin: false } as any);
    const res = await request(app).post('/api/platform/sports').set('Authorization', `Bearer ${superToken}`)
      .send({ name: 'X', defaultDurationsMin: [90] });
    expect(res.status).toBe(403);
  });

  it('401 sans token', async () => {
    const res = await request(app).post('/api/platform/sports').send({ name: 'X', defaultDurationsMin: [90] });
    expect(res.status).toBe(401);
  });
});

describe('PATCH /api/platform/sports/:id', () => {
  it('200 met à jour surfaces + durées sans toucher la clé', async () => {
    asSuper();
    prismaMock.sport.update.mockResolvedValue({ id: 's1', key: 'tennis', name: 'Tennis' } as any);
    const res = await request(app).patch('/api/platform/sports/s1').set('Authorization', `Bearer ${superToken}`)
      .send({ key: 'hacked', surfaces: ['Résine', 'Béton poreux'], defaultDurationsMin: [60, 90, 120] });
    expect(res.status).toBe(200);
    const arg = (prismaMock.sport.update as jest.Mock).mock.calls[0][0];
    expect(arg.data).not.toHaveProperty('key');
    expect(arg.data.surfaces).toEqual(['Résine', 'Béton poreux']);
  });

  it('404 SPORT_NOT_FOUND si le sport n existe pas', async () => {
    asSuper();
    prismaMock.sport.update.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('nf', { code: 'P2025', clientVersion: 'x' }));
    const res = await request(app).patch('/api/platform/sports/absent').set('Authorization', `Bearer ${superToken}`)
      .send({ name: 'Tennis' });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('SPORT_NOT_FOUND');
  });

  it('200 dépublie un sport (published:false) sans toucher au reste', async () => {
    asSuper();
    prismaMock.sport.update.mockResolvedValue({ id: 's1', key: 'padel', name: 'Padel' } as any);
    const res = await request(app).patch('/api/platform/sports/s1').set('Authorization', `Bearer ${superToken}`)
      .send({ published: false });
    expect(res.status).toBe(200);
    const arg = (prismaMock.sport.update as jest.Mock).mock.calls[0][0];
    expect(arg.data.published).toBe(false);
  });

  it('200 publie un sport (published:true)', async () => {
    asSuper();
    prismaMock.sport.update.mockResolvedValue({ id: 's1', key: 'padel', name: 'Padel' } as any);
    const res = await request(app).patch('/api/platform/sports/s1').set('Authorization', `Bearer ${superToken}`)
      .send({ published: true });
    expect(res.status).toBe(200);
    const arg = (prismaMock.sport.update as jest.Mock).mock.calls[0][0];
    expect(arg.data.published).toBe(true);
  });
});

describe('GET /api/platform/sports', () => {
  it('200 renvoie TOUS les sports (publiés + brouillons) pour un super-admin', async () => {
    asSuper();
    prismaMock.sport.findMany.mockResolvedValue([
      { id: 's1', key: 'padel', name: 'Padel', resourceNoun: 'terrain', defaultSlotStepMin: 30, defaultDurationsMin: [90], icon: '🎾', surfaces: [], published: true },
      { id: 's2', key: 'beach', name: 'Beach', resourceNoun: 'terrain', defaultSlotStepMin: 30, defaultDurationsMin: [60], icon: null, surfaces: [], published: false },
    ] as any);
    const res = await request(app).get('/api/platform/sports').set('Authorization', `Bearer ${superToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    const arg = (prismaMock.sport.findMany as jest.Mock).mock.calls[0][0];
    expect(arg.where).toBeUndefined();           // pas de filtre published
    expect(arg.select.published).toBe(true);
  });

  it('403 pour un non super-admin', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ isSuperAdmin: false } as any);
    const res = await request(app).get('/api/platform/sports').set('Authorization', `Bearer ${superToken}`);
    expect(res.status).toBe(403);
  });
});

describe('DELETE /api/platform/sports/:id', () => {
  it('409 SPORT_IN_USE si un club utilise le sport', async () => {
    asSuper();
    prismaMock.clubSport.count.mockResolvedValue(2 as any);
    const res = await request(app).delete('/api/platform/sports/s1').set('Authorization', `Bearer ${superToken}`);
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('SPORT_IN_USE');
  });

  it('200 supprime un sport inutilisé', async () => {
    asSuper();
    prismaMock.clubSport.count.mockResolvedValue(0 as any);
    prismaMock.sport.delete.mockResolvedValue({ id: 's1' } as any);
    const res = await request(app).delete('/api/platform/sports/s1').set('Authorization', `Bearer ${superToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: 's1' });
  });
});
