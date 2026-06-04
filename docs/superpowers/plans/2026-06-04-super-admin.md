# Espace super-admin plateforme — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Doter Palova d'un espace super-admin transverse (dashboard global, suspension/réactivation de clubs, création de club + gérant), gardé par un flag `User.isSuperAdmin` revérifié côté serveur.

**Architecture:** Champ booléen additif sur `User` ; middleware `requireSuperAdmin` (après `authMiddleware`) qui revérifie le flag en base ; service `PlatformService` + routes `/api/platform/*` ; espace front `/superadmin` servi uniquement sur l'hôte plateforme. JWT inchangé.

**Tech Stack:** Express 5, Prisma 7 (adapter-pg), Jest + ts-jest + jest-mock-extended (prisma mocké), supertest pour les routes ; Next.js 16 (App Router) côté front.

**Spec :** `docs/superpowers/specs/2026-06-04-super-admin-design.md`

---

## File Structure

**Backend (`backend/`)**
- Modify `prisma/schema.prisma` — ajoute `isSuperAdmin` au modèle `User`.
- Create migration `prisma/migrations/<ts>_add_super_admin/migration.sql` (générée par Prisma).
- Modify `prisma/seed.ts` — crée le compte `super@palova.fr`.
- Create `src/middleware/requireSuperAdmin.ts` — garde d'autorisation.
- Create `src/middleware/__tests__/requireSuperAdmin.test.ts`.
- Create `src/services/platform.service.ts` — `PlatformService` (stats, clubs, statut, création).
- Create `src/services/__tests__/platform.service.test.ts`.
- Create `src/routes/platform.ts` — routeur `/api/platform`.
- Create `src/routes/__tests__/platform.routes.test.ts` — supertest (401/403/200).
- Modify `src/app.ts` — monte `/api/platform` derrière `authMiddleware` + `requireSuperAdmin`.
- Modify `src/routes/auth.ts` — `publicUser` expose `isSuperAdmin`.

**Frontend (`frontend/`)** — ⚠️ `frontend/AGENTS.md` : « This is NOT the Next.js you know », lire `node_modules/next/dist/docs/` avant d'écrire. Toutes les pages ci-dessous sont des **client components** (`'use client'`, hooks) calqués sur l'existant (`app/admin/`, `app/login/`) → pas de `params`/async server, pas de surprise Next 16, mais suivre les conventions du repo.
- Modify `lib/api.ts` — méthodes + types plateforme.
- Create `app/superadmin/layout.tsx` — garde d'accès (host plateforme + super-admin).
- Create `app/superadmin/page.tsx` — dashboard stats.
- Create `app/superadmin/clubs/page.tsx` — liste + suspendre/réactiver.
- Create `app/superadmin/clubs/new/page.tsx` — créer un club + gérant.
- Modify `app/login/page.tsx` — aiguillage super-admin → `/superadmin`.

---

## Task 1: Champ `User.isSuperAdmin` + migration

**Files:**
- Modify: `backend/prisma/schema.prisma` (modèle `User`, après `sex`)
- Create: `backend/prisma/migrations/<ts>_add_super_admin/migration.sql` (générée)

- [ ] **Step 1: Ajouter le champ au schéma**

Dans `model User`, ajouter la ligne (après `sex Sex?`) :

```prisma
  sex       Sex?
  isSuperAdmin Boolean @default(false) @map("is_super_admin")
```

- [ ] **Step 2: Générer la migration additive + le client**

Run (dans `backend/`, Postgres up via docker-compose-v1.exe) :
```
npx prisma migrate dev --name add_super_admin
```
Expected : nouvelle migration créée et appliquée ; `is_super_admin BOOLEAN NOT NULL DEFAULT false` ajouté à `users` ; client Prisma régénéré. Aucune perte de données (champ avec défaut).

- [ ] **Step 3: Vérifier la compilation**

Run : `npx tsc --noEmit`
Expected : PASS (le champ `isSuperAdmin` est connu du client généré).

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(super-admin): champ User.isSuperAdmin (migration additive)"
```

---

## Task 2: Compte super-admin au seed

**Files:**
- Modify: `backend/prisma/seed.ts` (dans `main()`, section comptes — après le bloc démo accounts)

- [ ] **Step 1: Ajouter la création idempotente du super-admin**

Repérer dans `seed.ts` la section « 5. Comptes de démo » (après la boucle qui crée les `demoAccounts`). Ajouter juste après cette boucle :

```ts
  // 5b. Super-admin plateforme (idempotent). Mot de passe via env en prod, défaut dev.
  const superPassword = await bcrypt.hash(process.env.SUPERADMIN_PASSWORD ?? 'password123', 10);
  await prisma.user.upsert({
    where: { email: 'super@palova.fr' },
    update: { isSuperAdmin: true },
    create: {
      email: 'super@palova.fr',
      password: superPassword,
      firstName: 'Super',
      lastName: 'Admin',
      isSuperAdmin: true,
    },
  });
```

- [ ] **Step 2: Vérifier la compilation du seed**

Run : `npx tsc --noEmit`
Expected : PASS.

- [ ] **Step 3: Rejouer le seed et vérifier le compte**

Run (Postgres up) :
```
npm run db:seed
```
Puis vérifier en base :
```
npx prisma db execute --stdin <<< "SELECT email, is_super_admin FROM users WHERE email='super@palova.fr';"
```
Expected : une ligne `super@palova.fr | t`.

- [ ] **Step 4: Commit**

```bash
git add prisma/seed.ts
git commit -m "feat(super-admin): compte super@palova.fr au seed (mdp via SUPERADMIN_PASSWORD)"
```

---

## Task 3: Middleware `requireSuperAdmin` (TDD)

**Files:**
- Create: `backend/src/middleware/__tests__/requireSuperAdmin.test.ts`
- Create: `backend/src/middleware/requireSuperAdmin.ts`

- [ ] **Step 1: Écrire les tests (qui échouent)**

`src/middleware/__tests__/requireSuperAdmin.test.ts` :

```ts
import '../../__mocks__/prisma';
import { prismaMock } from '../../__mocks__/prisma';
import { requireSuperAdmin } from '../requireSuperAdmin';
import { AuthRequest } from '../auth';
import { Response } from 'express';

function mockRes() {
  const res: Partial<Response> = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res as Response;
}

describe('requireSuperAdmin', () => {
  it('401 si pas de req.user', async () => {
    const res = mockRes();
    const next = jest.fn();
    await requireSuperAdmin({ } as AuthRequest, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('403 si utilisateur introuvable', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null as any);
    const res = mockRes();
    const next = jest.fn();
    await requireSuperAdmin({ user: { id: 'u1', email: 'a@b.fr' } } as AuthRequest, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('403 si isSuperAdmin = false', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ isSuperAdmin: false } as any);
    const res = mockRes();
    const next = jest.fn();
    await requireSuperAdmin({ user: { id: 'u1', email: 'a@b.fr' } } as AuthRequest, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('next() si isSuperAdmin = true', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ isSuperAdmin: true } as any);
    const res = mockRes();
    const next = jest.fn();
    await requireSuperAdmin({ user: { id: 'u1', email: 'a@b.fr' } } as AuthRequest, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Lancer les tests → échec attendu**

Run : `npx jest src/middleware/__tests__/requireSuperAdmin.test.ts`
Expected : FAIL (`Cannot find module '../requireSuperAdmin'`).

- [ ] **Step 3: Implémenter le middleware**

`src/middleware/requireSuperAdmin.ts` :

```ts
import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth';
import { prisma } from '../db/prisma';

/**
 * À utiliser APRÈS authMiddleware. Revérifie en base que l'utilisateur est
 * super-admin plateforme (le flag n'est PAS dans le JWT, donc révoquable
 * immédiatement). Sinon 403.
 */
export async function requireSuperAdmin(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Token manquant' });
      return;
    }
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { isSuperAdmin: true },
    });
    if (!user || !user.isSuperAdmin) {
      res.status(403).json({ error: 'Accès super-admin requis' });
      return;
    }
    next();
  } catch (err) {
    next(err);
  }
}
```

- [ ] **Step 4: Lancer les tests → succès attendu**

Run : `npx jest src/middleware/__tests__/requireSuperAdmin.test.ts`
Expected : PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/middleware/requireSuperAdmin.ts src/middleware/__tests__/requireSuperAdmin.test.ts
git commit -m "feat(super-admin): middleware requireSuperAdmin (TDD)"
```

---

## Task 4: `PlatformService.getStats` (TDD)

**Files:**
- Create: `backend/src/services/__tests__/platform.service.test.ts`
- Create: `backend/src/services/platform.service.ts`

- [ ] **Step 1: Écrire le test (qui échoue)**

`src/services/__tests__/platform.service.test.ts` :

```ts
import '../../__mocks__/prisma';
import { prismaMock } from '../../__mocks__/prisma';
import { PlatformService } from '../platform.service';

describe('PlatformService.getStats', () => {
  const service = new PlatformService();

  it('agrège les compteurs globaux', async () => {
    prismaMock.club.count
      .mockResolvedValueOnce(5)   // total
      .mockResolvedValueOnce(4)   // active
      .mockResolvedValueOnce(1);  // suspended
    prismaMock.user.count.mockResolvedValue(120 as any);
    prismaMock.reservation.count.mockResolvedValue(300 as any);
    prismaMock.tournament.count.mockResolvedValue(8 as any);

    const stats = await service.getStats();
    expect(stats).toEqual({
      clubs: { total: 5, active: 4, suspended: 1 },
      users: 120,
      reservations: 300,
      tournaments: 8,
    });
  });
});
```

- [ ] **Step 2: Lancer → échec attendu**

Run : `npx jest src/services/__tests__/platform.service.test.ts`
Expected : FAIL (`Cannot find module '../platform.service'`).

- [ ] **Step 3: Créer le service avec `getStats`**

`src/services/platform.service.ts` :

```ts
import { Prisma } from '@prisma/client';
import bcrypt from 'bcrypt';
import { prisma } from '../db/prisma';
import { slugify } from './club.service';

export interface PlatformStats {
  clubs: { total: number; active: number; suspended: number };
  users: number;
  reservations: number;
  tournaments: number;
}

export class PlatformService {
  /** Statistiques globales de la plateforme. */
  async getStats(): Promise<PlatformStats> {
    const [total, active, suspended, users, reservations, tournaments] = await Promise.all([
      prisma.club.count(),
      prisma.club.count({ where: { status: 'ACTIVE' } }),
      prisma.club.count({ where: { status: 'SUSPENDED' } }),
      prisma.user.count(),
      prisma.reservation.count(),
      prisma.tournament.count(),
    ]);
    return { clubs: { total, active, suspended }, users, reservations, tournaments };
  }
}
```

- [ ] **Step 4: Lancer → succès attendu**

Run : `npx jest src/services/__tests__/platform.service.test.ts`
Expected : PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add src/services/platform.service.ts src/services/__tests__/platform.service.test.ts
git commit -m "feat(super-admin): PlatformService.getStats (TDD)"
```

---

## Task 5: `PlatformService.listClubs` (TDD)

**Files:**
- Modify: `backend/src/services/__tests__/platform.service.test.ts`
- Modify: `backend/src/services/platform.service.ts`

- [ ] **Step 1: Ajouter le test (qui échoue)**

Ajouter ce `describe` au fichier de test :

```ts
describe('PlatformService.listClubs', () => {
  const service = new PlatformService();

  it('renvoie tous les clubs (tous statuts) avec gérants et compteurs', async () => {
    prismaMock.club.findMany.mockResolvedValue([
      {
        id: 'club-demo', slug: 'padel-arena-paris', name: 'Padel Arena Paris',
        city: 'Paris', status: 'SUSPENDED', createdAt: new Date('2026-01-01'),
        members: [{ user: { id: 'u1', email: 'owner@palova.fr', firstName: 'O', lastName: 'M' } }],
        _count: { clubMemberships: 48, resources: 5 },
      },
    ] as any);

    const clubs = await service.listClubs();
    expect(prismaMock.club.findMany).toHaveBeenCalledWith(expect.objectContaining({
      orderBy: { createdAt: 'desc' },
    }));
    expect(clubs[0]).toEqual({
      id: 'club-demo', slug: 'padel-arena-paris', name: 'Padel Arena Paris',
      city: 'Paris', status: 'SUSPENDED', createdAt: new Date('2026-01-01'),
      owners: [{ id: 'u1', email: 'owner@palova.fr', firstName: 'O', lastName: 'M' }],
      counts: { adherents: 48, resources: 5 },
    });
  });
});
```

- [ ] **Step 2: Lancer → échec attendu**

Run : `npx jest src/services/__tests__/platform.service.test.ts -t listClubs`
Expected : FAIL (`service.listClubs is not a function`).

- [ ] **Step 3: Implémenter `listClubs`**

Ajouter la méthode dans la classe `PlatformService` :

```ts
  /** Tous les clubs (tous statuts), avec gérants OWNER et compteurs. */
  async listClubs() {
    const clubs = await prisma.club.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        members: {
          where: { role: 'OWNER' },
          include: { user: { select: { id: true, email: true, firstName: true, lastName: true } } },
        },
        _count: { select: { clubMemberships: true, resources: true } },
      },
    });
    return clubs.map((c) => ({
      id: c.id,
      slug: c.slug,
      name: c.name,
      city: c.city,
      status: c.status,
      createdAt: c.createdAt,
      owners: c.members.map((m) => m.user),
      counts: { adherents: c._count.clubMemberships, resources: c._count.resources },
    }));
  }
```

- [ ] **Step 4: Lancer → succès attendu**

Run : `npx jest src/services/__tests__/platform.service.test.ts`
Expected : PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/services/platform.service.ts src/services/__tests__/platform.service.test.ts
git commit -m "feat(super-admin): PlatformService.listClubs (TDD)"
```

---

## Task 6: `PlatformService.setClubStatus` (TDD)

**Files:**
- Modify: `backend/src/services/__tests__/platform.service.test.ts`
- Modify: `backend/src/services/platform.service.ts`

- [ ] **Step 1: Ajouter les tests (qui échouent)**

```ts
import { Prisma } from '@prisma/client';

describe('PlatformService.setClubStatus', () => {
  const service = new PlatformService();

  it('met à jour le statut quand il est valide', async () => {
    prismaMock.club.update.mockResolvedValue({ id: 'club-demo', status: 'SUSPENDED' } as any);
    const club = await service.setClubStatus('club-demo', 'SUSPENDED');
    expect(prismaMock.club.update).toHaveBeenCalledWith({
      where: { id: 'club-demo' }, data: { status: 'SUSPENDED' },
    });
    expect(club.status).toBe('SUSPENDED');
  });

  it('rejette VALIDATION_ERROR si le statut est invalide', async () => {
    await expect(service.setClubStatus('club-demo', 'BANNED' as any)).rejects.toThrow('VALIDATION_ERROR');
    expect(prismaMock.club.update).not.toHaveBeenCalled();
  });

  it('rejette CLUB_NOT_FOUND si le club n existe pas (P2025)', async () => {
    prismaMock.club.update.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('not found', { code: 'P2025', clientVersion: 'x' }),
    );
    await expect(service.setClubStatus('absent', 'ACTIVE')).rejects.toThrow('CLUB_NOT_FOUND');
  });
});
```

- [ ] **Step 2: Lancer → échec attendu**

Run : `npx jest src/services/__tests__/platform.service.test.ts -t setClubStatus`
Expected : FAIL (`service.setClubStatus is not a function`).

- [ ] **Step 3: Implémenter `setClubStatus`**

```ts
  /** Bascule le statut d'un club (ACTIVE/SUSPENDED). */
  async setClubStatus(id: string, status: 'ACTIVE' | 'SUSPENDED') {
    if (status !== 'ACTIVE' && status !== 'SUSPENDED') throw new Error('VALIDATION_ERROR');
    try {
      return await prisma.club.update({ where: { id }, data: { status } });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
        throw new Error('CLUB_NOT_FOUND');
      }
      throw err;
    }
  }
```

- [ ] **Step 4: Lancer → succès attendu**

Run : `npx jest src/services/__tests__/platform.service.test.ts`
Expected : PASS (5 tests cumulés).

- [ ] **Step 5: Commit**

```bash
git add src/services/platform.service.ts src/services/__tests__/platform.service.test.ts
git commit -m "feat(super-admin): PlatformService.setClubStatus (TDD)"
```

---

## Task 7: `PlatformService.createClubWithOwner` (TDD)

**Files:**
- Modify: `backend/src/services/__tests__/platform.service.test.ts`
- Modify: `backend/src/services/platform.service.ts`

- [ ] **Step 1: Ajouter les tests (qui échouent)**

```ts
describe('PlatformService.createClubWithOwner', () => {
  const service = new PlatformService();
  const validBody = {
    club: { name: 'Nantes Padel', city: 'Nantes', sportKey: 'padel' },
    owner: { firstName: 'Léa', lastName: 'Roux', email: 'lea@nantes.fr', password: 'password123' },
  };

  it('rejette VALIDATION_ERROR si un champ requis manque', async () => {
    await expect(service.createClubWithOwner({ ...validBody, club: { name: '' } } as any))
      .rejects.toThrow('VALIDATION_ERROR');
  });

  it('rejette VALIDATION_ERROR si le mot de passe fait moins de 8 caractères', async () => {
    await expect(service.createClubWithOwner({ ...validBody, owner: { ...validBody.owner, password: 'court' } }))
      .rejects.toThrow('VALIDATION_ERROR');
  });

  it('rejette EMAIL_TAKEN si l email gérant existe déjà', async () => {
    prismaMock.user.findFirst.mockResolvedValue({ id: 'u-exist' } as any);
    await expect(service.createClubWithOwner(validBody)).rejects.toThrow('EMAIL_TAKEN');
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('crée le gérant, le club, le ClubMember OWNER et le ClubSport', async () => {
    prismaMock.user.findFirst.mockResolvedValue(null as any);
    const tx = {
      user: { create: jest.fn().mockResolvedValue({ id: 'u-new', email: 'lea@nantes.fr', firstName: 'Léa', lastName: 'Roux' }) },
      club: { create: jest.fn().mockResolvedValue({ id: 'club-new', slug: 'nantes-padel', name: 'Nantes Padel', status: 'ACTIVE' }) },
      clubMember: { create: jest.fn().mockResolvedValue({}) },
      sport: { findUnique: jest.fn().mockResolvedValue({ id: 'sport-padel', key: 'padel' }) },
      clubSport: { create: jest.fn().mockResolvedValue({}) },
    };
    prismaMock.$transaction.mockImplementation(async (cb: any) => cb(tx));

    const result = await service.createClubWithOwner(validBody);
    expect(tx.user.create).toHaveBeenCalled();
    expect(tx.clubMember.create).toHaveBeenCalledWith({ data: { userId: 'u-new', clubId: 'club-new', role: 'OWNER' } });
    expect(tx.clubSport.create).toHaveBeenCalled();
    expect(result.club.slug).toBe('nantes-padel');
    expect(result.owner.email).toBe('lea@nantes.fr');
  });
});
```

- [ ] **Step 2: Lancer → échec attendu**

Run : `npx jest src/services/__tests__/platform.service.test.ts -t createClubWithOwner`
Expected : FAIL (`service.createClubWithOwner is not a function`).

- [ ] **Step 3: Implémenter `createClubWithOwner`**

Ajouter le type près de `PlatformStats` :

```ts
export interface CreateClubByPlatformParams {
  club: { name: string; city?: string; timezone?: string; sportKey?: string };
  owner: { firstName: string; lastName: string; email: string; password: string };
}
```

Et la méthode dans la classe :

```ts
  /** Crée un club ET son gérant OWNER (le super-admin n'est pas le gérant). */
  async createClubWithOwner(params: CreateClubByPlatformParams) {
    const name = (params.club?.name ?? '').trim();
    const email = (params.owner?.email ?? '').trim();
    const password = params.owner?.password ?? '';
    const firstName = (params.owner?.firstName ?? '').trim();
    const lastName = (params.owner?.lastName ?? '').trim();
    if (!name || !email || !firstName || !lastName) throw new Error('VALIDATION_ERROR');
    if (typeof password !== 'string' || password.length < 8) throw new Error('VALIDATION_ERROR');

    const slug = slugify(name);
    if (!slug) throw new Error('VALIDATION_ERROR');

    const existing = await prisma.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
    });
    if (existing) throw new Error('EMAIL_TAKEN');

    const hashed = await bcrypt.hash(password, 10);

    try {
      return await prisma.$transaction(async (tx) => {
        const owner = await tx.user.create({
          data: { email, password: hashed, firstName, lastName },
        });
        const club = await tx.club.create({
          data: {
            slug, name,
            city: params.club.city?.trim() || null,
            timezone: params.club.timezone || 'Europe/Paris',
            status: 'ACTIVE',
          },
        });
        await tx.clubMember.create({ data: { userId: owner.id, clubId: club.id, role: 'OWNER' } });
        if (params.club.sportKey) {
          const sport = await tx.sport.findUnique({ where: { key: params.club.sportKey } });
          if (sport) await tx.clubSport.create({ data: { clubId: club.id, sportId: sport.id } });
        }
        return {
          club,
          owner: { id: owner.id, email: owner.email, firstName: owner.firstName, lastName: owner.lastName },
        };
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new Error('SLUG_TAKEN');
      }
      throw err;
    }
  }
```

- [ ] **Step 4: Lancer → succès attendu**

Run : `npx jest src/services/__tests__/platform.service.test.ts`
Expected : PASS (9 tests cumulés).

- [ ] **Step 5: Commit**

```bash
git add src/services/platform.service.ts src/services/__tests__/platform.service.test.ts
git commit -m "feat(super-admin): PlatformService.createClubWithOwner (TDD)"
```

---

## Task 8: Routeur `/api/platform` + montage + tests de routes (TDD)

**Files:**
- Create: `backend/src/routes/__tests__/platform.routes.test.ts`
- Create: `backend/src/routes/platform.ts`
- Modify: `backend/src/app.ts`

- [ ] **Step 1: Écrire les tests de routes (qui échouent)**

`src/routes/__tests__/platform.routes.test.ts` :

```ts
import '../../__mocks__/prisma';
import { prismaMock } from '../../__mocks__/prisma';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../../app';

const SECRET = process.env.JWT_SECRET!;
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
```

- [ ] **Step 2: Lancer → échec attendu**

Run : `npx jest src/routes/__tests__/platform.routes.test.ts`
Expected : FAIL (route `/api/platform/stats` non montée → 404, donc l'assert 401 échoue).

- [ ] **Step 3: Créer le routeur**

`src/routes/platform.ts` :

```ts
import { Router, Response, NextFunction } from 'express';
import { PlatformService } from '../services/platform.service';

const router = Router();
const platform = new PlatformService();

const ERROR_STATUS: Record<string, number> = {
  VALIDATION_ERROR: 400,
  EMAIL_TAKEN:      409,
  SLUG_TAKEN:       409,
  CLUB_NOT_FOUND:   404,
};

const handleError = (err: unknown, res: Response, next: NextFunction) => {
  const message = (err as Error).message;
  const status = ERROR_STATUS[message];
  if (status) return void res.status(status).json({ error: message });
  next(err);
};

// Toutes ces routes sont déjà derrière authMiddleware + requireSuperAdmin (montage app.ts).
router.get('/stats', async (_req, res, next) => {
  try { res.json(await platform.getStats()); } catch (err) { handleError(err, res, next); }
});

router.get('/clubs', async (_req, res, next) => {
  try { res.json(await platform.listClubs()); } catch (err) { handleError(err, res, next); }
});

router.patch('/clubs/:id', async (req, res, next) => {
  try { res.json(await platform.setClubStatus(req.params.id, req.body?.status)); }
  catch (err) { handleError(err, res, next); }
});

router.post('/clubs', async (req, res, next) => {
  try { res.status(201).json(await platform.createClubWithOwner(req.body)); }
  catch (err) { handleError(err, res, next); }
});

export default router;
```

- [ ] **Step 4: Monter le routeur dans `app.ts`**

Ajouter l'import en tête (avec les autres routeurs) :
```ts
import platformRouter from './routes/platform';
import { authMiddleware } from './middleware/auth';
import { requireSuperAdmin } from './middleware/requireSuperAdmin';
```
Puis monter (juste après la ligne `app.use('/api/tournaments', tournamentsRouter);`) :
```ts
app.use('/api/platform', authMiddleware, requireSuperAdmin, platformRouter);
```

- [ ] **Step 5: Lancer → succès attendu**

Run : `npx jest src/routes/__tests__/platform.routes.test.ts`
Expected : PASS (3 tests).

- [ ] **Step 6: Vérifier compilation + suite complète**

Run : `npx tsc --noEmit && npx jest`
Expected : PASS, tsc clean, total de tests = 54 (existants) + 16 (super-admin) ≈ 70.

- [ ] **Step 7: Commit**

```bash
git add src/routes/platform.ts src/routes/__tests__/platform.routes.test.ts src/app.ts
git commit -m "feat(super-admin): routes /api/platform (stats, clubs, statut, création) + montage gardé"
```

---

## Task 9: Login expose `isSuperAdmin`

**Files:**
- Modify: `backend/src/routes/auth.ts`

- [ ] **Step 1: Étendre `BasicUser` et `publicUser`**

Dans `src/routes/auth.ts`, remplacer l'interface et la fonction :

```ts
interface BasicUser { id: string; email: string; firstName: string; lastName: string; isSuperAdmin: boolean; }

function publicUser(u: BasicUser) {
  return { id: u.id, email: u.email, firstName: u.firstName, lastName: u.lastName, isSuperAdmin: u.isSuperAdmin };
}
```

(Le `prisma.user.findUnique` du login et le `prisma.user.create` du register renvoient déjà l'objet complet, `isSuperAdmin` inclus — `false` par défaut pour un nouvel inscrit.)

- [ ] **Step 2: Vérifier compilation + tests**

Run : `npx tsc --noEmit && npx jest`
Expected : PASS (rien cassé).

- [ ] **Step 3: Vérifier manuellement la réponse login**

Run (backend lancé `npm run dev`, seed fait) :
```
curl -s -X POST http://localhost:3001/api/auth/login -H "Content-Type: application/json" -d "{\"email\":\"super@palova.fr\",\"password\":\"password123\"}"
```
Expected : JSON avec `"user":{...,"isSuperAdmin":true}`.

- [ ] **Step 4: Commit**

```bash
git add src/routes/auth.ts
git commit -m "feat(super-admin): la réponse login expose isSuperAdmin"
```

---

## Task 10: Client API frontend (méthodes + types)

**Files:**
- Modify: `frontend/lib/api.ts`

- [ ] **Step 1: Ajouter les méthodes plateforme dans l'objet `api`**

Dans `lib/api.ts`, ajouter dans l'objet `export const api = { ... }` (par ex. après `getMyClubs`) :

```ts
  // --- Plateforme (super-admin) ---
  platformStats: (token: string) => request<PlatformStats>('/api/platform/stats', {}, token),

  platformClubs: (token: string) => request<PlatformClub[]>('/api/platform/clubs', {}, token),

  platformSetClubStatus: (id: string, status: 'ACTIVE' | 'SUSPENDED', token: string) =>
    request<{ id: string; status: string }>(`/api/platform/clubs/${id}`, {
      method: 'PATCH', body: JSON.stringify({ status }),
    }, token),

  platformCreateClub: (body: CreateClubByPlatformBody, token: string) =>
    request<{ club: { id: string; slug: string; name: string }; owner: { id: string; email: string } }>(
      '/api/platform/clubs', { method: 'POST', body: JSON.stringify(body) }, token),
```

- [ ] **Step 2: Ajouter les types (en bas du fichier, près des autres `export interface`)**

```ts
export interface PlatformStats {
  clubs: { total: number; active: number; suspended: number };
  users: number;
  reservations: number;
  tournaments: number;
}

export interface PlatformClub {
  id: string;
  slug: string;
  name: string;
  city: string | null;
  status: 'ACTIVE' | 'SUSPENDED';
  createdAt: string;
  owners: { id: string; email: string; firstName: string; lastName: string }[];
  counts: { adherents: number; resources: number };
}

export interface CreateClubByPlatformBody {
  club: { name: string; city?: string; timezone?: string; sportKey?: string };
  owner: { firstName: string; lastName: string; email: string; password: string };
}
```

Et **modifier** le type `AuthResponse` existant (≈ ligne 372) pour exposer le flag :

```ts
export interface AuthResponse {
  token: string;
  user: { id: string; email: string; firstName: string; lastName: string; isSuperAdmin: boolean };
}
```

- [ ] **Step 3: Vérifier compilation**

Run (dans `frontend/`) : `npx tsc --noEmit`
Expected : PASS.

- [ ] **Step 4: Commit**

```bash
git add lib/api.ts
git commit -m "feat(super-admin): client API plateforme (stats, clubs, statut, création) + types"
```

---

## Task 11: Garde d'accès `/superadmin` (layout)

**Files:**
- Create: `frontend/app/superadmin/layout.tsx`

- [ ] **Step 1: Créer le layout avec garde (host plateforme + vérif serveur)**

`app/superadmin/layout.tsx` :

```tsx
'use client';
import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { useAuth, logout } from '@/lib/useAuth';
import { useClub } from '@/lib/ClubProvider';
import { api } from '@/lib/api';
import { useTheme } from '@/lib/ThemeProvider';
import { Logotype, ThemeToggle } from '@/components/ui/atoms';
import { Icon } from '@/components/ui/Icon';

export default function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { th } = useTheme();
  const { token, ready } = useAuth();
  const { slug } = useClub();
  const [allowed, setAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    if (!ready) return;
    if (slug) { router.replace('/'); return; }        // pas de super-admin sur un host club
    if (!token) { router.replace('/login'); return; }
    api.platformStats(token)                            // 403 ⇒ pas super-admin, le serveur tranche
      .then(() => setAllowed(true))
      .catch(() => setAllowed(false));
  }, [ready, token, slug, router]);

  useEffect(() => { if (allowed === false) router.replace('/'); }, [allowed, router]);

  if (!ready || slug || !token || allowed !== true) {
    return (
      <div style={{ minHeight: '100vh', background: th.bg, color: th.textFaint, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: th.fontUI }}>
        Chargement…
      </div>
    );
  }

  const links = [
    { href: '/superadmin',          label: 'Tableau de bord', icon: 'grid' as const },
    { href: '/superadmin/clubs',    label: 'Clubs',           icon: 'indoor' as const },
    { href: '/superadmin/clubs/new', label: 'Créer un club',  icon: 'bolt' as const },
  ];

  return (
    <div style={{ minHeight: '100vh', background: th.bg, color: th.text, fontFamily: th.fontUI, display: 'flex' }}>
      <aside style={{
        position: 'sticky', top: 0, alignSelf: 'flex-start', height: '100vh',
        width: 244, flexShrink: 0, boxSizing: 'border-box',
        background: th.bgElev, borderRight: `1px solid ${th.line}`,
        display: 'flex', flexDirection: 'column', padding: '20px 14px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 8px 6px' }}>
          <Logotype size={22} />
        </div>
        <div style={{ fontFamily: th.fontUI, fontSize: 11, fontWeight: 600, letterSpacing: 0.6, textTransform: 'uppercase', color: th.textFaint, padding: '6px 10px 14px' }}>
          Plateforme
        </div>
        <nav style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {links.map((l) => {
            const active = pathname === l.href;
            return (
              <Link key={l.href} href={l.href} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10,
                textDecoration: 'none', fontSize: 14, fontWeight: 600,
                color: active ? th.onAccent : th.textMute, background: active ? th.accent : 'transparent',
              }}>
                <Icon name={l.icon} size={17} /> {l.label}
              </Link>
            );
          })}
        </nav>
        <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 12 }}>
          <ThemeToggle />
          <button onClick={logout} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: th.textMute, fontFamily: th.fontUI, fontSize: 13, fontWeight: 600 }}>
            Déconnexion
          </button>
        </div>
      </aside>
      <main style={{ flex: 1, padding: '28px 32px', maxWidth: 1100 }}>{children}</main>
    </div>
  );
}
```

> Icônes `grid`, `indoor`, `bolt` et clés `th.bg/bgElev/line/text/textFaint/textMute/onAccent/accent/fontUI` : **confirmées** (déjà utilisées par `app/admin/layout.tsx`). `Logotype`, `ThemeToggle`, `Icon` importés comme dans le layout admin.

- [ ] **Step 2: Vérifier compilation**

Run : `npx tsc --noEmit`
Expected : PASS.

- [ ] **Step 3: Commit**

```bash
git add app/superadmin/layout.tsx
git commit -m "feat(super-admin): layout /superadmin (garde host plateforme + vérif serveur)"
```

---

## Task 12: Dashboard `/superadmin`

**Files:**
- Create: `frontend/app/superadmin/page.tsx`

- [ ] **Step 1: Créer la page dashboard**

`app/superadmin/page.tsx` :

```tsx
'use client';
import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/useAuth';
import { api, PlatformStats } from '@/lib/api';
import { useTheme } from '@/lib/ThemeProvider';

function Card({ label, value, sub }: { label: string; value: number | string; sub?: string }) {
  const { th } = useTheme();
  return (
    <div style={{ background: th.bgElev, border: `1px solid ${th.line}`, borderRadius: 14, padding: '18px 20px' }}>
      <div style={{ fontSize: 12.5, color: th.textMute, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4 }}>{label}</div>
      <div style={{ fontSize: 34, fontWeight: 700, color: th.text, fontFamily: th.fontMono, marginTop: 6 }}>{value}</div>
      {sub && <div style={{ fontSize: 12.5, color: th.textFaint, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

export default function SuperAdminDashboard() {
  const { th } = useTheme();
  const { token } = useAuth();
  const [stats, setStats] = useState<PlatformStats | null>(null);

  useEffect(() => {
    if (!token) return;
    api.platformStats(token).then(setStats).catch(() => setStats(null));
  }, [token]);

  return (
    <div>
      <h1 style={{ fontFamily: th.fontDisplay, fontSize: 30, fontWeight: 600, color: th.text, marginBottom: 24 }}>
        Tableau de bord plateforme
      </h1>
      {!stats ? (
        <div style={{ color: th.textFaint, fontFamily: th.fontUI }}>Chargement…</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
          <Card label="Clubs" value={stats.clubs.total} sub={`${stats.clubs.active} actifs · ${stats.clubs.suspended} suspendus`} />
          <Card label="Utilisateurs" value={stats.users} />
          <Card label="Réservations" value={stats.reservations} />
          <Card label="Tournois" value={stats.tournaments} />
        </div>
      )}
    </div>
  );
}
```

> `th.fontDisplay`, `th.fontUI`, `th.fontMono`, `th.text`, `th.textMute`, `th.textFaint`, `th.bgElev`, `th.line` : **confirmées** dans `lib/theme.ts`.

- [ ] **Step 2: Vérifier compilation**

Run : `npx tsc --noEmit`
Expected : PASS.

- [ ] **Step 3: Commit**

```bash
git add app/superadmin/page.tsx
git commit -m "feat(super-admin): dashboard stats /superadmin"
```

---

## Task 13: Liste des clubs + suspendre/réactiver

**Files:**
- Create: `frontend/app/superadmin/clubs/page.tsx`

- [ ] **Step 1: Créer la page liste avec action de statut**

`app/superadmin/clubs/page.tsx` :

```tsx
'use client';
import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/lib/useAuth';
import { api, PlatformClub } from '@/lib/api';
import { useTheme } from '@/lib/ThemeProvider';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

export default function SuperAdminClubs() {
  const { th } = useTheme();
  const { token } = useAuth();
  const [clubs, setClubs] = useState<PlatformClub[]>([]);
  const [pending, setPending] = useState<PlatformClub | null>(null); // club dont on confirme le changement

  const load = useCallback(() => {
    if (!token) return;
    api.platformClubs(token).then(setClubs).catch(() => setClubs([]));
  }, [token]);

  useEffect(load, [load]);

  async function applyStatus() {
    if (!pending || !token) return;
    const next = pending.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    await api.platformSetClubStatus(pending.id, next, token).catch(() => {});
    setPending(null);
    load();
  }

  const cell: React.CSSProperties = { padding: '12px 14px', borderBottom: `1px solid ${th.line}`, fontSize: 14, color: th.text };
  const head: React.CSSProperties = { ...cell, color: th.textMute, fontWeight: 700, fontSize: 12.5, textTransform: 'uppercase', letterSpacing: 0.4 };

  return (
    <div>
      <h1 style={{ fontFamily: th.fontUI, fontSize: 28, fontWeight: 700, color: th.text, marginBottom: 20 }}>Clubs</h1>
      <div style={{ background: th.bgElev, border: `1px solid ${th.line}`, borderRadius: 14, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>
            <th style={{ ...head, textAlign: 'left' }}>Club</th>
            <th style={{ ...head, textAlign: 'left' }}>Gérant</th>
            <th style={{ ...head, textAlign: 'right' }}>Adhérents</th>
            <th style={{ ...head, textAlign: 'right' }}>Ressources</th>
            <th style={{ ...head, textAlign: 'left' }}>Statut</th>
            <th style={{ ...head, textAlign: 'right' }}>Action</th>
          </tr></thead>
          <tbody>
            {clubs.map((c) => (
              <tr key={c.id}>
                <td style={cell}><strong>{c.name}</strong><br /><span style={{ color: th.textFaint, fontSize: 12.5 }}>{c.slug}{c.city ? ` · ${c.city}` : ''}</span></td>
                <td style={cell}>{c.owners[0]?.email ?? <span style={{ color: th.textFaint }}>—</span>}</td>
                <td style={{ ...cell, textAlign: 'right', fontFamily: th.fontMono }}>{c.counts.adherents}</td>
                <td style={{ ...cell, textAlign: 'right', fontFamily: th.fontMono }}>{c.counts.resources}</td>
                <td style={cell}>
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: c.status === 'ACTIVE' ? th.accent : th.textFaint }}>
                    {c.status === 'ACTIVE' ? 'Actif' : 'Suspendu'}
                  </span>
                </td>
                <td style={{ ...cell, textAlign: 'right' }}>
                  <button onClick={() => setPending(c)} style={{
                    border: `1px solid ${th.line}`, background: 'transparent', color: th.text,
                    borderRadius: 9, padding: '6px 12px', cursor: 'pointer', fontSize: 13, fontWeight: 600,
                  }}>
                    {c.status === 'ACTIVE' ? 'Suspendre' : 'Réactiver'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pending && (
        <ConfirmDialog
          title={pending.status === 'ACTIVE' ? `Suspendre ${pending.name} ?` : `Réactiver ${pending.name} ?`}
          message={pending.status === 'ACTIVE'
            ? 'Le club disparaîtra de l’annuaire public et sa page ne sera plus accessible.'
            : 'Le club redeviendra visible dans l’annuaire et sa page sera de nouveau accessible.'}
          confirmLabel={pending.status === 'ACTIVE' ? 'Suspendre' : 'Réactiver'}
          onConfirm={applyStatus}
          onCancel={() => setPending(null)}
        />
      )}
    </div>
  );
}
```

> Signature réelle (vérifiée) de `ConfirmDialog` : `{ title: string; detail?; message?; confirmLabel?='Confirmer'; cancelLabel?='Retour'; busy?=false; onConfirm; onCancel }`. **Pas** de prop `danger` : le bouton de confirmation est toujours en variante `danger` (orange) — acceptable pour suspendre comme réactiver en v1.

- [ ] **Step 2: Vérifier compilation**

Run : `npx tsc --noEmit`
Expected : PASS.

- [ ] **Step 3: Commit**

```bash
git add app/superadmin/clubs/page.tsx
git commit -m "feat(super-admin): liste des clubs + suspendre/réactiver"
```

---

## Task 14: Créer un club + gérant

**Files:**
- Create: `frontend/app/superadmin/clubs/new/page.tsx`

- [ ] **Step 1: Créer le formulaire de création**

`app/superadmin/clubs/new/page.tsx` :

```tsx
'use client';
import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/useAuth';
import { api } from '@/lib/api';
import { useTheme } from '@/lib/ThemeProvider';
import { Field, Btn } from '@/components/ui/atoms';

export default function NewClubByPlatform() {
  const router = useRouter();
  const { th } = useTheme();
  const { token } = useAuth();
  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [sportKey, setSportKey] = useState('padel');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    setError(null); setLoading(true);
    try {
      await api.platformCreateClub({
        club: { name, city: city || undefined, sportKey },
        owner: { firstName, lastName, email, password },
      }, token);
      router.push('/superadmin/clubs');
    } catch (err) {
      const m = (err as Error).message;
      setError(m === 'EMAIL_TAKEN' ? 'Cet email gérant est déjà utilisé'
        : m === 'SLUG_TAKEN' ? 'Un club avec ce nom existe déjà'
        : m === 'VALIDATION_ERROR' ? 'Champs manquants ou mot de passe trop court (8 min)'
        : 'Création impossible');
    } finally { setLoading(false); }
  }

  return (
    <div style={{ maxWidth: 520 }}>
      <h1 style={{ fontFamily: th.fontUI, fontSize: 28, fontWeight: 700, color: th.text, marginBottom: 20 }}>Créer un club</h1>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {error && <div style={{ fontSize: 13.5, color: th.onAccent, background: th.accent, padding: '11px 14px', borderRadius: 12, fontWeight: 600 }}>{error}</div>}
        <div style={{ fontSize: 12.5, color: th.textMute, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4 }}>Club</div>
        <Field label="Nom du club" value={name} onChange={setName} required />
        <Field label="Ville" value={city} onChange={setCity} />
        <Field label="Sport principal (key)" value={sportKey} onChange={setSportKey} />
        <div style={{ fontSize: 12.5, color: th.textMute, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, marginTop: 8 }}>Gérant</div>
        <Field label="Prénom" value={firstName} onChange={setFirstName} required />
        <Field label="Nom" value={lastName} onChange={setLastName} required />
        <Field label="Email" type="email" value={email} onChange={setEmail} required autoComplete="off" />
        <Field label="Mot de passe (8 min)" type="password" value={password} onChange={setPassword} required autoComplete="new-password" />
        <Btn type="submit" full disabled={loading}>{loading ? 'Création…' : 'Créer le club'}</Btn>
      </form>
    </div>
  );
}
```

> Signatures réelles (vérifiées) : `Field({ label, type?, value, onChange?: (v)=>void, placeholder?, icon?, required?, autoComplete? })` ; `Btn({ children, variant?, full?, onClick?, icon?, style?, disabled?, type? })`. L'usage ci-dessus est conforme.

- [ ] **Step 2: Vérifier compilation**

Run : `npx tsc --noEmit`
Expected : PASS.

- [ ] **Step 3: Commit**

```bash
git add app/superadmin/clubs/new/page.tsx
git commit -m "feat(super-admin): formulaire création club + gérant"
```

---

## Task 15: Aiguillage du login vers `/superadmin`

**Files:**
- Modify: `frontend/app/login/page.tsx`

- [ ] **Step 1: Rediriger un super-admin après login (host plateforme)**

Dans `handleSubmit` de `app/login/page.tsx`, juste après avoir récupéré `data` et **avant** le bloc `if (slug) { ... } else { ... }`, insérer :

```ts
      if (!slug && data.user?.isSuperAdmin) {
        setSession(data.token, null);
        router.push('/superadmin');
        return;
      }
```

(Sur un host club, on garde le comportement actuel : un super-admin s'y connecte comme un visiteur normal.)

- [ ] **Step 2: Vérifier compilation**

Run : `npx tsc --noEmit`
Expected : PASS. (`data` vient d'un `fetch` brut non typé dans la page login → `data.user?.isSuperAdmin` compile ; `AuthResponse.user.isSuperAdmin` a déjà été ajouté en Task 10.)

- [ ] **Step 3: Commit**

```bash
git add app/login/page.tsx
git commit -m "feat(super-admin): login redirige le super-admin vers /superadmin"
```

---

## Task 16: Vérification de bout en bout

**Files:** aucun (validation).

- [ ] **Step 1: Migration + seed appliqués en local**

Run (backend, Postgres up) :
```
npm run db:migrate
npm run db:seed
```
Expected : migration `add_super_admin` appliquée, `super@palova.fr` créé.

- [ ] **Step 2: Backend — suite complète + types**

Run (backend) : `npx tsc --noEmit && npx jest`
Expected : PASS, tsc clean. ~70 tests.

- [ ] **Step 3: Frontend — types + tests existants**

Run (frontend) : `npx tsc --noEmit && npx jest`
Expected : PASS (11 tests existants verts), tsc clean.

- [ ] **Step 4: e2e navigateur (manuel)**

Démarrer back + front. Sur l'**hôte plateforme** (`localhost:3000`) :
1. Login `super@palova.fr` / `password123` → redirigé vers `/superadmin`, dashboard avec stats.
2. `/superadmin/clubs` → liste tous les clubs ; **Suspendre** un club de test → confirmer → statut « Suspendu ».
3. Ouvrir l'annuaire `/clubs` → le club suspendu **n'apparaît plus** ; sa page `/<slug>.localhost:3000` n'est plus servie (CLUB_NOT_FOUND). **Réactiver** → il réapparaît.
4. `/superadmin/clubs/new` → créer un club + gérant ; se déconnecter, se reconnecter avec le gérant → il atteint son `/admin` (sur le sous-domaine du nouveau club).
5. Login avec un compte non super-admin (`test@palova.fr`) puis aller manuellement sur `/superadmin` → redirigé hors de l'espace (vérif serveur 403).

- [ ] **Step 5: Commit final (doc/CLAUDE.md si à jour)**

Mettre à jour `CLAUDE.md` (section fonctionnalités) avec un court paragraphe « Espace super-admin », puis :
```bash
git add CLAUDE.md
git commit -m "docs(super-admin): documente l'espace super-admin plateforme"
```

---

## Notes de prod (rappel)
- Avant le seed **prod** sur la VM Hetzner : poser `SUPERADMIN_PASSWORD` dans `.env.prod`, puis
  `docker compose --env-file .env.prod -f docker-compose.prod.yml exec backend npm run db:seed`.
- La migration `add_super_admin` est additive : `prisma migrate deploy` la rejoue sans risque au déploiement.
- Aucune route ne pose `isSuperAdmin` : le flag se gère en base / au seed uniquement (pas d'élévation via l'API).
