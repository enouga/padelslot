import '../../__mocks__/prisma';
import { prismaMock } from '../../__mocks__/prisma';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { Prisma } from '@prisma/client';
import app from '../../app';

const SECRET = process.env.JWT_SECRET!;
if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET manquant dans l environnement de test (.env)');
const tokenFor = (id: string) => jwt.sign({ id, email: `${id}@x.fr` }, SECRET, { expiresIn: '1h' });

describe('GET /api/platform/stats (autorisation)', () => {
  it('401 sans token', async () => {
    const res = await request(app).get('/api/platform/stats');
    expect(res.status).toBe(401);
  });

  it('403 avec un token de non super-admin', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ isSuperAdmin: false } as any);
    const res = await request(app).get('/api/platform/stats').set('Authorization', `Bearer ${tokenFor('u1')}`);
    expect(res.status).toBe(403);
  });

  it('200 avec un token de super-admin', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ isSuperAdmin: true } as any);
    prismaMock.club.count.mockResolvedValue(0 as any);
    prismaMock.user.count.mockResolvedValue(0 as any);
    prismaMock.reservation.count.mockResolvedValue(0 as any);
    prismaMock.tournament.count.mockResolvedValue(0 as any);
    const res = await request(app).get('/api/platform/stats').set('Authorization', `Bearer ${tokenFor('admin')}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('clubs');
  });
});

describe('POST /api/platform/clubs', () => {
  const superToken = tokenFor('admin');
  const validBody = {
    club: { name: 'Nantes Padel', city: 'Nantes', sportKey: 'padel' },
    owner: { firstName: 'Léa', lastName: 'Roux', email: 'lea@nantes.fr', password: 'password123' },
  };

  it('201 crée le club + gérant', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ isSuperAdmin: true } as any); // requireSuperAdmin
    prismaMock.user.findFirst.mockResolvedValue(null as any);                    // email libre
    const tx = {
      clubSlugAlias: { findUnique: jest.fn().mockResolvedValue(null) },
      user: { create: jest.fn().mockResolvedValue({ id: 'u-new', email: 'lea@nantes.fr', firstName: 'Léa', lastName: 'Roux' }) },
      club: { create: jest.fn().mockResolvedValue({ id: 'club-new', slug: 'nantes-padel', name: 'Nantes Padel', status: 'ACTIVE' }) },
      clubMember: { create: jest.fn().mockResolvedValue({}) },
      sport: { findUnique: jest.fn().mockResolvedValue({ id: 'sport-padel', key: 'padel' }) },
      clubSport: { create: jest.fn().mockResolvedValue({}) },
    };
    prismaMock.$transaction.mockImplementation(async (cb: any) => cb(tx));
    const res = await request(app).post('/api/platform/clubs').set('Authorization', `Bearer ${superToken}`).send(validBody);
    expect(res.status).toBe(201);
    expect(res.body.club.slug).toBe('nantes-padel');
  });

  it('409 si l email gérant est déjà pris', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ isSuperAdmin: true } as any);
    prismaMock.user.findFirst.mockResolvedValue({ id: 'u-exist' } as any);
    const res = await request(app).post('/api/platform/clubs').set('Authorization', `Bearer ${superToken}`).send(validBody);
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('EMAIL_TAKEN');
  });

  it('400 si un champ requis manque', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ isSuperAdmin: true } as any);
    const res = await request(app).post('/api/platform/clubs').set('Authorization', `Bearer ${superToken}`)
      .send({ ...validBody, club: { name: '' } });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
  });
});

describe('PATCH /api/platform/clubs/:id', () => {
  const superToken = tokenFor('admin');

  it('200 met à jour le statut', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ isSuperAdmin: true } as any);
    prismaMock.club.update.mockResolvedValue({ id: 'club-demo', status: 'SUSPENDED' } as any);
    const res = await request(app).patch('/api/platform/clubs/club-demo').set('Authorization', `Bearer ${superToken}`)
      .send({ status: 'SUSPENDED' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('SUSPENDED');
  });

  it('404 si le club n existe pas', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ isSuperAdmin: true } as any);
    prismaMock.club.update.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('not found', { code: 'P2025', clientVersion: 'x' }),
    );
    const res = await request(app).patch('/api/platform/clubs/absent').set('Authorization', `Bearer ${superToken}`)
      .send({ status: 'ACTIVE' });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('CLUB_NOT_FOUND');
  });

  it('400 si le statut est invalide', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ isSuperAdmin: true } as any);
    const res = await request(app).patch('/api/platform/clubs/club-demo').set('Authorization', `Bearer ${superToken}`)
      .send({ status: 'BANNED' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
  });
});
