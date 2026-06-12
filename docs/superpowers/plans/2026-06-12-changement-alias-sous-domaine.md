# Changement d'alias de sous-domaine d'un club — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permettre au super-admin plateforme (et à lui seul) de changer le slug/sous-domaine d'un club, l'ancien slug devenant un alias permanent qui redirige en 308 vers le nouveau sous-domaine.

**Architecture:** Nouvelle table `ClubSlugAlias` (PK = slug → unicité globale, FK `clubId` cascade). Le changement (`PlatformService.changeClubSlug`) se fait en transaction : l'ancien slug devient alias, le club prend le nouveau. La redirection se résout côté serveur Next dans `app/layout.tsx` (seul endroit SSR qui connaît déjà le slug) via un endpoint léger `GET /api/clubs/_resolve/:slug`, avec `permanentRedirect()` (= 308) qui préserve chemin + query grâce à un nouvel en-tête `x-club-path` posé par `proxy.ts`. Renommer un club ne touche jamais le slug ; l'UI superadmin suggère `slugify(nom)`.

**Tech Stack:** Express 5 + Prisma 7 (backend), Next.js 16 + React 19 (frontend, styles inline + `useTheme()`), Jest + supertest (backend), Jest + RTL (frontend). Caddy on-demand TLS : **aucun travail infra** (`/internal/tls-check` autorise déjà tout `*.palova.fr`).

**Décisions actées (brainstorming du 2026-06-12) :**
- Seul le **super-admin** change le slug (pas le gérant).
- Ancien slug = **alias permanent** : redirection 308, réservé à vie — sauf swap-back par le club lui-même.
- Changement de **nom** et d'**alias découplés** ; l'UI affiche une suggestion `slugify(nom)`.
- Slugs réservés : `www`, `app`, `api`, `superadmin` (erreur `SLUG_RESERVED` 400 ; `SLUG_INVALID` 400 si slugify vide ; `SLUG_TAKEN` 409).
- Route dédiée `POST /api/platform/clubs/:id/slug` (et non extension du `PATCH /clubs/:id` qui revalide strictement `status`).

---

### Task 1 : Modèle Prisma `ClubSlugAlias` + migration

**Files:**
- Modify: `backend/prisma/schema.prisma`

- [ ] **Step 1 : Ajouter la relation dans `model Club`**

Dans `model Club`, après la ligne `memberPackages   MemberPackage[]` (fin de la liste des relations, ~ligne 155), ajouter :

```prisma
  slugAliases      ClubSlugAlias[]
```

- [ ] **Step 2 : Ajouter le modèle après la fermeture de `model Club`**

```prisma
/// Ancien slug d'un club, conservé à vie : <alias>.palova.fr redirige (308) vers le slug actuel.
/// La PK sur slug garantit l'unicité globale ; un alias ne peut être repris que par son propre club (swap-back).
model ClubSlugAlias {
  slug      String   @id
  clubId    String   @map("club_id")
  createdAt DateTime @default(now()) @map("created_at")

  club Club @relation(fields: [clubId], references: [id], onDelete: Cascade)

  @@index([clubId])
  @@map("club_slug_aliases")
}
```

- [ ] **Step 3 : Générer la migration**

Run (dossier `backend/`) : `npx prisma migrate dev --name add_club_slug_aliases`
Expected : migration créée dans `backend/prisma/migrations/<ts>_add_club_slug_aliases/`, SQL contenant :

```sql
CREATE TABLE "club_slug_aliases" (
    "slug" TEXT NOT NULL,
    "club_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "club_slug_aliases_pkey" PRIMARY KEY ("slug")
);
CREATE INDEX "club_slug_aliases_club_id_idx" ON "club_slug_aliases"("club_id");
ALTER TABLE "club_slug_aliases" ADD CONSTRAINT "club_slug_aliases_club_id_fkey"
  FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

> `npx prisma generate` est rejoué par `migrate dev`. Le mock de tests (`backend/src/__mocks__/prisma.ts`, `mockDeep<PrismaClient>()`) expose automatiquement `prismaMock.clubSlugAlias.*` — rien à modifier.

- [ ] **Step 4 : Vérifier que la suite backend passe toujours**

Run (dossier `backend/`) : `npm test`
Expected : PASS (aucun test ne touche encore au nouveau modèle).

- [ ] **Step 5 : Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations
git commit -m "feat(alias): modele ClubSlugAlias (PK slug, FK club cascade)"
```

---

### Task 2 : `club.service.ts` — slugs réservés, `resolveSlug`, garde à la création

**Files:**
- Modify: `backend/src/services/club.service.ts`
- Test: `backend/src/services/__tests__/club.service.test.ts`

- [ ] **Step 1 : Écrire les tests qui échouent**

Ajouter à la fin de `backend/src/services/__tests__/club.service.test.ts` (le fichier importe déjà `prismaMock` et instancie `ClubService` — réutiliser les imports existants du fichier) :

```ts
describe('ClubService.resolveSlug', () => {
  const service = new ClubService();

  it('slug actuel → moved:false', async () => {
    prismaMock.club.findUnique.mockResolvedValue({ slug: 'arena' } as any);
    await expect(service.resolveSlug('arena')).resolves.toEqual({ slug: 'arena', moved: false });
  });

  it('alias historique → slug actuel du club, moved:true', async () => {
    prismaMock.club.findUnique.mockResolvedValue(null as any);
    prismaMock.clubSlugAlias.findUnique.mockResolvedValue({ club: { slug: 'nouveau' } } as any);
    await expect(service.resolveSlug('ancien')).resolves.toEqual({ slug: 'nouveau', moved: true });
  });

  it('inconnu → CLUB_NOT_FOUND', async () => {
    prismaMock.club.findUnique.mockResolvedValue(null as any);
    prismaMock.clubSlugAlias.findUnique.mockResolvedValue(null as any);
    await expect(service.resolveSlug('inconnu')).rejects.toThrow('CLUB_NOT_FOUND');
  });
});

describe('ClubService.createClub — slugs réservés / alias', () => {
  const service = new ClubService();

  it('SLUG_RESERVED pour un libellé technique', async () => {
    await expect(service.createClub({ ownerId: 'u1', name: 'App' })).rejects.toThrow('SLUG_RESERVED');
  });

  it('SLUG_TAKEN si le slug est un alias historique d un club', async () => {
    prismaMock.clubSlugAlias.findUnique.mockResolvedValue({ slug: 'ancien-club' } as any);
    await expect(service.createClub({ ownerId: 'u1', name: 'Ancien Club' })).rejects.toThrow('SLUG_TAKEN');
  });
});
```

- [ ] **Step 2 : Vérifier l'échec**

Run : `npx jest src/services/__tests__/club.service.test.ts`
Expected : FAIL — `service.resolveSlug is not a function` + les 2 tests createClub échouent (pas de garde).

- [ ] **Step 3 : Implémenter**

Dans `backend/src/services/club.service.ts` :

a) Après la fonction `slugify` (lignes 38–45), ajouter :

```ts
/** Libellés de sous-domaine interdits comme slug de club (hôtes plateforme / techniques). */
export const RESERVED_SLUGS = new Set(['www', 'app', 'api', 'superadmin']);
```

b) Dans `createClub`, le code actuel (lignes 62–63) est :

```ts
    const slug = slugify(params.slug?.trim() || name);
    if (!slug) throw new Error('VALIDATION_ERROR');
```

Ajouter immédiatement après :

```ts
    if (RESERVED_SLUGS.has(slug)) throw new Error('SLUG_RESERVED');
    // Un ancien alias d'un club reste réservé à vie : aucun nouveau club ne peut le revendiquer.
    const reserved = await prisma.clubSlugAlias.findUnique({ where: { slug }, select: { slug: true } });
    if (reserved) throw new Error('SLUG_TAKEN');
```

c) Ajouter la méthode `resolveSlug` dans `ClubService`, juste avant `getClubBySlug` (~ligne 113) :

```ts
  /** Résout un libellé de sous-domaine : slug actuel → moved:false ; alias historique → slug actuel + moved:true. */
  async resolveSlug(slug: string) {
    const club = await prisma.club.findUnique({ where: { slug }, select: { slug: true } });
    if (club) return { slug: club.slug, moved: false };
    const alias = await prisma.clubSlugAlias.findUnique({
      where: { slug },
      select: { club: { select: { slug: true } } },
    });
    if (alias) return { slug: alias.club.slug, moved: true };
    throw new Error('CLUB_NOT_FOUND');
  }
```

> `getClubBySlug` reste inchangé : la redirection se fait au niveau hôte (layout), pas au niveau API.

- [ ] **Step 4 : Vérifier le succès**

Run : `npx jest src/services/__tests__/club.service.test.ts`
Expected : PASS (tous les tests du fichier, anciens inclus).

- [ ] **Step 5 : Commit**

```bash
git add backend/src/services/club.service.ts backend/src/services/__tests__/club.service.test.ts
git commit -m "feat(alias): resolveSlug + slugs reserves + alias bloques a la creation de club"
```

---

### Task 3 : `platform.service.ts` — `changeClubSlug`, aliases dans `listClubs`, garde création

**Files:**
- Modify: `backend/src/services/platform.service.ts`
- Test: `backend/src/services/__tests__/platform.service.test.ts`

- [ ] **Step 1 : Écrire les tests qui échouent**

Ajouter à la fin de `backend/src/services/__tests__/platform.service.test.ts` (imports déjà présents en tête : `prismaMock`, `PlatformService`) :

```ts
describe('PlatformService.changeClubSlug', () => {
  const service = new PlatformService();

  function makeTx(overrides: { clubBySlug?: unknown; alias?: unknown } = {}) {
    return {
      club: {
        findUnique: jest.fn().mockResolvedValue(overrides.clubBySlug ?? null),
        update: jest.fn().mockImplementation(async ({ data }: { data: { slug: string } }) =>
          ({ id: 'club-1', slug: data.slug, name: 'Padel Arena' })),
      },
      clubSlugAlias: {
        findUnique: jest.fn().mockResolvedValue(overrides.alias ?? null),
        delete: jest.fn().mockResolvedValue({}),
        create: jest.fn().mockResolvedValue({}),
      },
    };
  }

  beforeEach(() => {
    // Club ciblé existant, slug actuel 'old-arena'.
    prismaMock.club.findUnique.mockResolvedValue({ id: 'club-1', slug: 'old-arena', name: 'Padel Arena' } as any);
  });

  it('SLUG_INVALID si le slug normalisé est vide', async () => {
    await expect(service.changeClubSlug('club-1', '!!!')).rejects.toThrow('SLUG_INVALID');
    await expect(service.changeClubSlug('club-1', undefined)).rejects.toThrow('SLUG_INVALID');
  });

  it('SLUG_RESERVED pour les libellés techniques (www, app, api, superadmin)', async () => {
    for (const s of ['www', 'app', 'api', 'superadmin']) {
      await expect(service.changeClubSlug('club-1', s)).rejects.toThrow('SLUG_RESERVED');
    }
  });

  it('CLUB_NOT_FOUND si le club n existe pas', async () => {
    prismaMock.club.findUnique.mockResolvedValue(null as any);
    await expect(service.changeClubSlug('absent', 'nouveau')).rejects.toThrow('CLUB_NOT_FOUND');
  });

  it('no-op (aucune transaction) si le slug est inchangé', async () => {
    const out = await service.changeClubSlug('club-1', 'Old Arena'); // slugify → 'old-arena'
    expect(out).toEqual({ id: 'club-1', slug: 'old-arena', name: 'Padel Arena' });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('SLUG_TAKEN si le slug est le slug actuel d un autre club', async () => {
    const tx = makeTx({ clubBySlug: { id: 'club-2' } });
    prismaMock.$transaction.mockImplementation(async (cb: any) => cb(tx));
    await expect(service.changeClubSlug('club-1', 'pris')).rejects.toThrow('SLUG_TAKEN');
  });

  it('SLUG_TAKEN si le slug est un alias appartenant à un AUTRE club', async () => {
    const tx = makeTx({ alias: { clubId: 'club-2' } });
    prismaMock.$transaction.mockImplementation(async (cb: any) => cb(tx));
    await expect(service.changeClubSlug('club-1', 'ancien-d-un-autre')).rejects.toThrow('SLUG_TAKEN');
  });

  it('swap-back : reprendre son propre alias supprime la ligne d alias puis bascule', async () => {
    const tx = makeTx({ alias: { clubId: 'club-1' } });
    prismaMock.$transaction.mockImplementation(async (cb: any) => cb(tx));
    const out = await service.changeClubSlug('club-1', 'mon-ancien-slug');
    expect(tx.clubSlugAlias.delete).toHaveBeenCalledWith({ where: { slug: 'mon-ancien-slug' } });
    expect(tx.clubSlugAlias.create).toHaveBeenCalledWith({ data: { slug: 'old-arena', clubId: 'club-1' } });
    expect(out.slug).toBe('mon-ancien-slug');
  });

  it('insère l ancien slug en alias et met à jour le club (normalisation slugify)', async () => {
    const tx = makeTx();
    prismaMock.$transaction.mockImplementation(async (cb: any) => cb(tx));
    const out = await service.changeClubSlug('club-1', 'Pâdel Çlub  Paris!');
    expect(tx.clubSlugAlias.create).toHaveBeenCalledWith({ data: { slug: 'old-arena', clubId: 'club-1' } });
    expect(tx.club.update).toHaveBeenCalledWith({
      where: { id: 'club-1' },
      data: { slug: 'padel-club-paris' },
      select: { id: true, slug: true, name: true },
    });
    expect(out).toEqual({ id: 'club-1', slug: 'padel-club-paris', name: 'Padel Arena' });
  });
});
```

- [ ] **Step 2 : Vérifier l'échec**

Run : `npx jest src/services/__tests__/platform.service.test.ts`
Expected : FAIL — `service.changeClubSlug is not a function`.

- [ ] **Step 3 : Implémenter**

Dans `backend/src/services/platform.service.ts` :

a) Ligne 4, remplacer :

```ts
import { slugify } from './club.service';
```

par :

```ts
import { slugify, RESERVED_SLUGS } from './club.service';
```

b) Dans `listClubs` (lignes 34–55) : dans le `include`, après `_count: { select: { clubMemberships: true, resources: true } },` (ligne 42), ajouter :

```ts
        slugAliases: { select: { slug: true }, orderBy: { createdAt: 'asc' } },
```

et dans le `map` de retour, après `status: c.status,` (ligne 50), ajouter :

```ts
      aliases: c.slugAliases.map((a) => a.slug),
```

c) Ajouter la méthode `changeClubSlug` après `setClubStatus` (après la ligne 69) :

```ts
  /**
   * Change le slug (sous-domaine) d'un club — réservé au super-admin plateforme.
   * L'ancien slug devient un alias permanent (redirection 308 côté front) réservé à vie.
   * Le club peut reprendre un de SES anciens alias (swap-back : la ligne d'alias est supprimée).
   */
  async changeClubSlug(clubId: string, rawSlug: unknown) {
    const slug = slugify(typeof rawSlug === 'string' ? rawSlug : '');
    if (!slug) throw new Error('SLUG_INVALID');
    if (RESERVED_SLUGS.has(slug)) throw new Error('SLUG_RESERVED');

    const club = await prisma.club.findUnique({ where: { id: clubId }, select: { id: true, slug: true, name: true } });
    if (!club) throw new Error('CLUB_NOT_FOUND');
    if (club.slug === slug) return { id: club.id, slug: club.slug, name: club.name }; // no-op

    try {
      return await prisma.$transaction(async (tx) => {
        const current = await tx.club.findUnique({ where: { slug }, select: { id: true } });
        if (current) throw new Error('SLUG_TAKEN'); // slug actuel d'un autre club
        const alias = await tx.clubSlugAlias.findUnique({ where: { slug }, select: { clubId: true } });
        if (alias && alias.clubId !== clubId) throw new Error('SLUG_TAKEN'); // alias réservé par un autre club
        if (alias) await tx.clubSlugAlias.delete({ where: { slug } }); // swap-back : le club reprend son ancien alias
        await tx.clubSlugAlias.create({ data: { slug: club.slug, clubId } }); // l'ancien slug devient alias permanent
        return tx.club.update({ where: { id: clubId }, data: { slug }, select: { id: true, slug: true, name: true } });
      });
    } catch (err) {
      // Course concurrente : violation d'unicité (slug ou alias créé entre-temps).
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') throw new Error('SLUG_TAKEN');
      throw err;
    }
  }
```

d) Dans `createClubWithOwner`, après (lignes 81–82) :

```ts
    const slug = slugify(name);
    if (!slug) throw new Error('VALIDATION_ERROR');
```

ajouter :

```ts
    if (RESERVED_SLUGS.has(slug)) throw new Error('SLUG_RESERVED');
    const reservedAlias = await prisma.clubSlugAlias.findUnique({ where: { slug }, select: { slug: true } });
    if (reservedAlias) throw new Error('SLUG_TAKEN');
```

- [ ] **Step 4 : Vérifier le succès**

Run : `npx jest src/services/__tests__/platform.service.test.ts`
Expected : PASS. ⚠️ Si le test existant de `listClubs` échoue parce que le mock ne renvoie pas `slugAliases`, ajouter `slugAliases: [],` à l'objet club mocké de ce test et `aliases: []` au résultat attendu.

- [ ] **Step 5 : Commit**

```bash
git add backend/src/services/platform.service.ts backend/src/services/__tests__/platform.service.test.ts
git commit -m "feat(alias): PlatformService.changeClubSlug (transaction, swap-back) + aliases dans listClubs"
```

---

### Task 4 : Routes backend — `POST /clubs/:id/slug` + `GET /api/clubs/_resolve/:slug`

**Files:**
- Modify: `backend/src/routes/platform.ts`
- Modify: `backend/src/routes/clubs.ts`
- Test: `backend/src/routes/__tests__/platform.routes.test.ts`

- [ ] **Step 1 : Écrire les tests qui échouent**

Ajouter à la fin de `backend/src/routes/__tests__/platform.routes.test.ts` (le helper `tokenFor` existe en tête de fichier) :

```ts
describe('POST /api/platform/clubs/:id/slug', () => {
  const superToken = tokenFor('admin');

  it('401 sans token', async () => {
    const res = await request(app).post('/api/platform/clubs/club-1/slug').send({ slug: 'nouveau' });
    expect(res.status).toBe(401);
  });

  it('403 avec un token de non super-admin', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ isSuperAdmin: false } as any);
    const res = await request(app).post('/api/platform/clubs/club-1/slug')
      .set('Authorization', `Bearer ${tokenFor('u1')}`).send({ slug: 'nouveau' });
    expect(res.status).toBe(403);
  });

  it('200 change le slug et renvoie le club mis à jour', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ isSuperAdmin: true } as any); // requireSuperAdmin
    prismaMock.club.findUnique.mockResolvedValue({ id: 'club-1', slug: 'old-arena', name: 'Arena' } as any);
    const tx = {
      club: {
        findUnique: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue({ id: 'club-1', slug: 'new-arena', name: 'Arena' }),
      },
      clubSlugAlias: {
        findUnique: jest.fn().mockResolvedValue(null),
        delete: jest.fn(),
        create: jest.fn().mockResolvedValue({}),
      },
    };
    prismaMock.$transaction.mockImplementation(async (cb: any) => cb(tx));
    const res = await request(app).post('/api/platform/clubs/club-1/slug')
      .set('Authorization', `Bearer ${superToken}`).send({ slug: 'New Arena' });
    expect(res.status).toBe(200);
    expect(res.body.slug).toBe('new-arena');
    expect(tx.clubSlugAlias.create).toHaveBeenCalledWith({ data: { slug: 'old-arena', clubId: 'club-1' } });
  });

  it('409 SLUG_TAKEN si le slug appartient à un autre club', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ isSuperAdmin: true } as any);
    prismaMock.club.findUnique.mockResolvedValue({ id: 'club-1', slug: 'old-arena', name: 'Arena' } as any);
    const tx = {
      club: { findUnique: jest.fn().mockResolvedValue({ id: 'club-2' }), update: jest.fn() },
      clubSlugAlias: { findUnique: jest.fn(), delete: jest.fn(), create: jest.fn() },
    };
    prismaMock.$transaction.mockImplementation(async (cb: any) => cb(tx));
    const res = await request(app).post('/api/platform/clubs/club-1/slug')
      .set('Authorization', `Bearer ${superToken}`).send({ slug: 'pris' });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('SLUG_TAKEN');
  });

  it('400 SLUG_RESERVED pour www', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ isSuperAdmin: true } as any);
    prismaMock.club.findUnique.mockResolvedValue({ id: 'club-1', slug: 'old-arena', name: 'Arena' } as any);
    const res = await request(app).post('/api/platform/clubs/club-1/slug')
      .set('Authorization', `Bearer ${superToken}`).send({ slug: 'www' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('SLUG_RESERVED');
  });
});

describe('GET /api/clubs/_resolve/:slug', () => {
  it('renvoie moved:false pour un slug actuel', async () => {
    prismaMock.club.findUnique.mockResolvedValue({ slug: 'arena' } as any);
    const res = await request(app).get('/api/clubs/_resolve/arena');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ slug: 'arena', moved: false });
  });

  it('renvoie moved:true + slug actuel pour un alias', async () => {
    prismaMock.club.findUnique.mockResolvedValue(null as any);
    prismaMock.clubSlugAlias.findUnique.mockResolvedValue({ club: { slug: 'nouveau' } } as any);
    const res = await request(app).get('/api/clubs/_resolve/ancien');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ slug: 'nouveau', moved: true });
  });

  it('404 pour un libellé inconnu', async () => {
    prismaMock.club.findUnique.mockResolvedValue(null as any);
    prismaMock.clubSlugAlias.findUnique.mockResolvedValue(null as any);
    const res = await request(app).get('/api/clubs/_resolve/inconnu');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('CLUB_NOT_FOUND');
  });
});
```

- [ ] **Step 2 : Vérifier l'échec**

Run : `npx jest src/routes/__tests__/platform.routes.test.ts`
Expected : FAIL — 404 sur `POST /api/platform/clubs/:id/slug` et sur `GET /api/clubs/_resolve/...` (routes inexistantes ; `/_resolve/arena` matche `GET /:slug` avec `slug='_resolve'` → CLUB_NOT_FOUND sur les cas 200).

- [ ] **Step 3 : Implémenter**

**`backend/src/routes/platform.ts`** :

a) Étendre `ERROR_STATUS` (lignes 7–12). Actuel :

```ts
const ERROR_STATUS: Record<string, number> = {
  VALIDATION_ERROR: 400,
  EMAIL_TAKEN:      409,
  SLUG_TAKEN:       409,
  CLUB_NOT_FOUND:   404,
};
```

Devient :

```ts
const ERROR_STATUS: Record<string, number> = {
  VALIDATION_ERROR: 400,
  SLUG_INVALID:     400,
  SLUG_RESERVED:    400,
  EMAIL_TAKEN:      409,
  SLUG_TAKEN:       409,
  CLUB_NOT_FOUND:   404,
};
```

b) Ajouter après le `router.patch('/clubs/:id', ...)` (lignes 30–33) :

```ts
// Changement d'alias (slug / sous-domaine) d'un club. L'ancien slug devient un alias permanent.
router.post('/clubs/:id/slug', async (req, res, next) => {
  try { res.json(await platform.changeClubSlug(req.params.id, req.body?.slug)); }
  catch (err) { handleError(err, res, next); }
});
```

**`backend/src/routes/clubs.ts`** :

c) Dans `ERROR_STATUS` (lignes 21–27), ajouter `SLUG_RESERVED:       400,` après `SLUG_TAKEN:          409,` (`createClub` peut désormais le lever).

d) Insérer la route de résolution **immédiatement après** la fonction `asString` (après la ligne 40), donc **avant toutes les routes `/:slug...`** :

```ts
// Résolution d'un libellé de sous-domaine : slug actuel ({moved:false}) ou alias historique ({moved:true}).
// Préfixe `_` : slugify() ne produit jamais d'underscore → aucune collision avec un vrai slug.
// Déclarée en PREMIER pour ne pas être interceptée par les routes /:slug/*.
router.get('/_resolve/:slug', async (req: Request, res: Response, next: NextFunction) => {
  try { res.json(await clubService.resolveSlug(asString(req.params.slug))); }
  catch (err) { handleError(err, res, next); }
});
```

⚠️ Vérifier dans `clubs.ts` l'ordre réel des routes : la route `/_resolve/:slug` doit être déclarée avant la première route `GET /:slug...` du fichier (les routes `POST /` et `GET /` peuvent rester avant).

- [ ] **Step 4 : Vérifier le succès**

Run : `npx jest src/routes/__tests__/platform.routes.test.ts` puis `npm test`
Expected : PASS (toute la suite backend).

- [ ] **Step 5 : Commit**

```bash
git add backend/src/routes/platform.ts backend/src/routes/clubs.ts backend/src/routes/__tests__/platform.routes.test.ts
git commit -m "feat(alias): routes POST /platform/clubs/:id/slug et GET /clubs/_resolve/:slug"
```

---

### Task 5 : Frontend — miroir `slugify` + méthodes API

**Files:**
- Create: `frontend/lib/slug.ts`
- Modify: `frontend/lib/api.ts`
- Test: `frontend/__tests__/slug.test.ts` (create)

- [ ] **Step 1 : Écrire le test qui échoue**

Créer `frontend/__tests__/slug.test.ts` :

```ts
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
});
```

- [ ] **Step 2 : Vérifier l'échec**

Run (dossier `frontend/`) : `npx jest __tests__/slug.test.ts`
Expected : FAIL — `Cannot find module '../lib/slug'`.

- [ ] **Step 3 : Implémenter**

Créer `frontend/lib/slug.ts` :

```ts
/** Miroir de slugify() de backend/src/services/club.service.ts — garder les deux synchronisés. */
export function slugify(input: string): string {
  return input
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // enlève les accents
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}
```

Dans `frontend/lib/api.ts` :

a) Section publique — après la méthode `getClub` (~ligne 44) :

```ts
  /** Résout un libellé de sous-domaine (slug actuel ou alias historique). 404 si inconnu. */
  resolveClubSlug: (slug: string) =>
    request<{ slug: string; moved: boolean }>(`/api/clubs/_resolve/${slug}`),
```

b) Section plateforme — après `platformSetClubStatus` (~lignes 329–332) :

```ts
  platformChangeClubSlug: (id: string, slug: string, token: string) =>
    request<{ id: string; slug: string; name: string }>(`/api/platform/clubs/${id}/slug`, {
      method: 'POST', body: JSON.stringify({ slug }),
    }, token),
```

⚠️ Calquer la signature exacte sur `platformSetClubStatus` voisin (même helper `request`, même position du paramètre `token`).

c) Type `PlatformClub` (~lignes 949–958) — ajouter après `slug: string;` :

```ts
  aliases: string[];
```

- [ ] **Step 4 : Vérifier le succès**

Run : `npx jest __tests__/slug.test.ts`
Expected : PASS. Puis `npx tsc --noEmit` — ⚠️ les usages existants de `PlatformClub` (mocks de tests notamment) peuvent casser : ajouter `aliases: []` aux objets mockés signalés.

- [ ] **Step 5 : Commit**

```bash
git add frontend/lib/slug.ts frontend/lib/api.ts frontend/__tests__/slug.test.ts
git commit -m "feat(alias): slugify front (miroir backend) + api resolveClubSlug/platformChangeClubSlug"
```

---

### Task 6 : Frontend — en-tête `x-club-path` + redirection 308 dans le layout

**Files:**
- Modify: `frontend/proxy.ts:69-72`
- Modify: `frontend/app/layout.tsx:1-5,38-47`

> Pas de test Jest possible : composant serveur + `permanentRedirect` (exception interne Next). Couvert par les tests backend de `resolveSlug` (Task 2/4) et la vérification manuelle (Task 9).

- [ ] **Step 1 : Proxy — transmettre le chemin complet**

Dans `frontend/proxy.ts`, bloc actuel (lignes 69–72) :

```ts
  // Injecte le slug pour le layout serveur.
  const headers = new Headers(request.headers);
  headers.set('x-club-slug', slug);
  return NextResponse.next({ request: { headers } });
```

Devient :

```ts
  // Injecte le slug + le chemin complet pour le layout serveur (résolution d'alias → redirection 308).
  const headers = new Headers(request.headers);
  headers.set('x-club-slug', slug);
  headers.set('x-club-path', url.pathname + url.search);
  return NextResponse.next({ request: { headers } });
```

- [ ] **Step 2 : Layout — résolution + `permanentRedirect`**

Dans `frontend/app/layout.tsx`, compléter les imports en tête de fichier :

```tsx
import { permanentRedirect } from 'next/navigation';
import { api } from '@/lib/api';
```

puis remplacer le composant (lignes 38–47) :

```tsx
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const slug = (await headers()).get('x-club-slug');
  return (
    <html lang="fr" className={`${geistSans.variable} ${geistMono.variable} ${righteous.variable}`} suppressHydrationWarning>
      <body suppressHydrationWarning>
        <ClubProvider slug={slug}>{children}</ClubProvider>
      </body>
    </html>
  );
}
```

par :

```tsx
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const h = await headers();
  const slug = h.get('x-club-slug');

  // Hôte club : si le slug est un ANCIEN alias, redirection permanente (308) vers le
  // sous-domaine actuel en conservant chemin + query. En cas d'échec de l'API (club
  // inconnu, backend indisponible), on laisse la page se rendre comme aujourd'hui.
  let movedTo: string | null = null;
  if (slug) {
    try {
      const r = await api.resolveClubSlug(slug);
      if (r.moved && r.slug !== slug) movedTo = r.slug;
    } catch { /* comportement actuel inchangé */ }
  }
  if (movedTo) {
    const host = h.get('host') || '';
    const proto = h.get('x-forwarded-proto') || 'http';
    const path = h.get('x-club-path') || '/';
    permanentRedirect(`${proto}://${host.replace(/^[^.]+/, movedTo)}${path}`);
  }

  return (
    <html lang="fr" className={`${geistSans.variable} ${geistMono.variable} ${righteous.variable}`} suppressHydrationWarning>
      <body suppressHydrationWarning>
        <ClubProvider slug={slug}>{children}</ClubProvider>
      </body>
    </html>
  );
}
```

Points de vigilance :
- `permanentRedirect` lève une exception interne `NEXT_REDIRECT` : il **doit rester hors du `try/catch`** (c'est le cas ci-dessus). Il émet un **308** (vérifié : `RedirectStatusCode.PermanentRedirect = 308`).
- `host.replace(/^[^.]+/, movedTo)` préserve le port en dev (`ancien.localhost:3000` → `nouveau.localhost:3000`) et le domaine en prod.
- Fetch volontairement **non caché** (défaut Next 16) : après un swap-back, aucune boucle de redirection possible. Coût : un `findUnique` indexé par chargement SSR dur d'un hôte club uniquement (le proxy ne fait toujours **aucun** fetch).
- Côté serveur, `api` utilise `NEXT_PUBLIC_API_URL` (inliné au build) : en prod Docker, vérifier que le conteneur Next atteint cette URL (déjà le cas — même réseau compose).

- [ ] **Step 3 : Vérifier que rien ne casse**

Run (dossier `frontend/`) : `npm test` puis `npx tsc --noEmit`
Expected : PASS / aucune erreur (les hôtes plateforme n'ont pas de `x-club-slug` → aucun appel ajouté pour eux).

- [ ] **Step 4 : Commit**

```bash
git add frontend/proxy.ts frontend/app/layout.tsx
git commit -m "feat(alias): redirection 308 des anciens sous-domaines (layout serveur + x-club-path)"
```

---

### Task 7 : Frontend — UI superadmin « Changer l'alias »

**Files:**
- Modify: `frontend/app/superadmin/clubs/page.tsx` (remplacement intégral, le fichier fait ~98 lignes)
- Test: `frontend/__tests__/SuperAdminClubsSlug.test.tsx` (create)

- [ ] **Step 1 : Écrire les tests qui échouent**

Créer `frontend/__tests__/SuperAdminClubsSlug.test.tsx` :

```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import SuperAdminClubs from '../app/superadmin/clubs/page';
import { ThemeProvider } from '../lib/ThemeProvider';

const platformClubs = jest.fn();
const platformChangeClubSlug = jest.fn();
jest.mock('../lib/api', () => ({
  api: {
    platformClubs: (...a: unknown[]) => platformClubs(...a),
    platformSetClubStatus: jest.fn(),
    platformChangeClubSlug: (...a: unknown[]) => platformChangeClubSlug(...a),
  },
}));
jest.mock('../lib/useAuth', () => ({ useAuth: () => ({ token: 'tok' }) }));

const club = {
  id: 'club-1', slug: 'old-arena', name: 'Padel Arena Paris', city: 'Paris',
  status: 'ACTIVE', createdAt: '2026-01-01', aliases: ['tout-premier'],
  owners: [{ id: 'u1', email: 'owner@x.fr', firstName: 'O', lastName: 'M' }],
  counts: { adherents: 10, resources: 4 },
};

function renderPage() {
  return render(<ThemeProvider><SuperAdminClubs /></ThemeProvider>);
}

beforeEach(() => {
  jest.clearAllMocks();
  platformClubs.mockResolvedValue([club]);
});

it('affiche les alias existants du club', async () => {
  renderPage();
  expect(await screen.findByText(/Alias : tout-premier/)).toBeInTheDocument();
});

it('ouvre le dialog avec la suggestion slugify(nom) et envoie le nouveau slug', async () => {
  platformChangeClubSlug.mockResolvedValue({ id: 'club-1', slug: 'padel-arena-paris', name: club.name });
  renderPage();
  fireEvent.click(await screen.findByRole('button', { name: "Changer l'alias" }));
  // Suggestion préremplie = slugify('Padel Arena Paris')
  expect(screen.getByDisplayValue('padel-arena-paris')).toBeInTheDocument();
  // Deux boutons portent ce nom (ligne + dialog) : celui du dialog est rendu en dernier.
  const dialogConfirm = screen.getAllByRole('button', { name: "Changer l'alias" }).pop()!;
  fireEvent.click(dialogConfirm);
  await waitFor(() =>
    expect(platformChangeClubSlug).toHaveBeenCalledWith('club-1', 'padel-arena-paris', 'tok'));
});

it("affiche l'erreur française quand l'alias est pris", async () => {
  platformChangeClubSlug.mockRejectedValue(new Error('SLUG_TAKEN'));
  renderPage();
  fireEvent.click(await screen.findByRole('button', { name: "Changer l'alias" }));
  const dialogConfirm = screen.getAllByRole('button', { name: "Changer l'alias" }).pop()!;
  fireEvent.click(dialogConfirm);
  expect(await screen.findByText(/déjà utilisé ou réservé/)).toBeInTheDocument();
});
```

⚠️ Calquer le boilerplate de mock sur les tests superadmin existants s'il y en a (chercher `platformClubs` dans `frontend/__tests__/`) — si `ThemeProvider` s'importe autrement (ex. wrapper de test commun), suivre le pattern du fichier voisin.

- [ ] **Step 2 : Vérifier l'échec**

Run : `npx jest __tests__/SuperAdminClubsSlug.test.tsx`
Expected : FAIL — pas de bouton « Changer l'alias », pas de texte « Alias : ».

- [ ] **Step 3 : Implémenter — remplacer `frontend/app/superadmin/clubs/page.tsx` par :**

```tsx
'use client';
import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/lib/useAuth';
import { api, PlatformClub } from '@/lib/api';
import { useTheme } from '@/lib/ThemeProvider';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Btn } from '@/components/ui/atoms';
import { slugify } from '@/lib/slug';

const ROOT = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'localhost';

/** Dialog top-sheet de changement d'alias (même langage visuel que ConfirmDialog). */
function ChangeSlugDialog({ club, onDone, onCancel }: {
  club: PlatformClub;
  onDone: () => void;
  onCancel: () => void;
}) {
  const { th } = useTheme();
  const { token } = useAuth();
  // Suggestion : slug dérivé du nom ACTUEL du club (renommer un club ne touche jamais son slug).
  const [value, setValue] = useState(slugify(club.name));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const next = slugify(value);
  const unchanged = next === club.slug;

  async function submit() {
    if (!token || !next || unchanged) return;
    setBusy(true); setError(null);
    try {
      await api.platformChangeClubSlug(club.id, next, token);
      onDone();
    } catch (err) {
      const m = (err as Error).message;
      setError(m === 'SLUG_TAKEN' ? 'Cet alias est déjà utilisé ou réservé par un autre club.'
        : m === 'SLUG_RESERVED' ? 'Cet alias est réservé par la plateforme (www, app, api…).'
        : m === 'SLUG_INVALID' ? 'Alias invalide : utilisez des lettres, chiffres et tirets.'
        : "Échec du changement d'alias. Réessayez.");
    } finally { setBusy(false); }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 95, display: 'flex', flexDirection: 'column', justifyContent: 'flex-start' }}>
      <div onClick={busy ? undefined : onCancel} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(2px)', animation: 'sp-fade .25s ease' }} />
      <div role="dialog" aria-modal="true" style={{ position: 'relative', width: '100%', maxWidth: 480, margin: '0 auto', background: th.bgElev, borderRadius: '0 0 28px 28px', padding: '12px 20px 36px', boxShadow: '0 10px 40px rgba(0,0,0,0.3)', animation: 'sp-sheet-in-top .34s cubic-bezier(.2,.8,.2,1)' }}>
        <div style={{ fontFamily: th.fontDisplay, fontWeight: 600, fontSize: 26, color: th.text, letterSpacing: -0.3 }}>
          Changer l&apos;alias de {club.name}
        </div>

        <div style={{ fontFamily: th.fontUI, fontSize: 13.5, color: th.textMute, marginTop: 14 }}>
          Adresse actuelle : <span style={{ fontFamily: th.fontMono, color: th.text }}>{club.slug}.{ROOT}</span>
        </div>

        <label style={{ display: 'block', marginTop: 14 }}>
          <span style={{ fontSize: 12.5, color: th.textMute, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4 }}>Nouvel alias</span>
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            autoFocus
            style={{
              display: 'block', width: '100%', marginTop: 6, padding: '11px 14px',
              borderRadius: 12, border: `1px solid ${th.line}`, background: th.surface2,
              color: th.text, fontFamily: th.fontMono, fontSize: 14.5, outline: 'none',
            }}
          />
        </label>

        <div style={{ fontFamily: th.fontUI, fontSize: 13.5, color: th.textMute, marginTop: 10 }}>
          Nouvelle adresse : <span style={{ fontFamily: th.fontMono, color: th.accent }}>{next || '…'}.{ROOT}</span>
        </div>

        <div style={{ fontFamily: th.fontUI, fontSize: 13, color: th.textMute, marginTop: 12, lineHeight: 1.45 }}>
          L&apos;ancienne adresse <span style={{ fontFamily: th.fontMono }}>{club.slug}.{ROOT}</span> restera
          réservée et redirigera définitivement les anciens liens vers la nouvelle adresse.
        </div>

        {error && (
          <div style={{ fontSize: 13.5, color: th.onAccent, background: th.accent, padding: '11px 14px', borderRadius: 12, fontWeight: 600, marginTop: 12 }}>{error}</div>
        )}

        <div style={{ display: 'flex', gap: 11, marginTop: 24 }}>
          <Btn variant="surface" onClick={onCancel} disabled={busy} style={{ flex: '0 0 42%' }}>Retour</Btn>
          <Btn onClick={submit} disabled={busy || !next || unchanged} style={{ flex: 1 }}>
            {busy ? '…' : "Changer l'alias"}
          </Btn>
        </div>
        <div style={{ width: 38, height: 5, borderRadius: 3, background: th.lineStrong, margin: '18px auto 0' }} />
      </div>
    </div>
  );
}

export default function SuperAdminClubs() {
  const { th } = useTheme();
  const { token } = useAuth();
  const [clubs, setClubs] = useState<PlatformClub[]>([]);
  const [pending, setPending] = useState<PlatformClub | null>(null);   // club dont on confirme le changement de statut
  const [slugTarget, setSlugTarget] = useState<PlatformClub | null>(null); // club dont on change l'alias
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!token) return;
    api.platformClubs(token).then(setClubs).catch(() => setClubs([]));
  }, [token]);

  useEffect(load, [load]);

  async function applyStatus() {
    if (!pending || !token) return;
    const next = pending.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    setBusy(true); setError(null);
    try {
      await api.platformSetClubStatus(pending.id, next, token);
      setPending(null);
      load();
    } catch {
      setError('Échec de la mise à jour du statut. Réessayez.');
    } finally {
      setBusy(false);
    }
  }

  const cell: React.CSSProperties = { padding: '12px 14px', borderBottom: `1px solid ${th.line}`, fontSize: 14, color: th.text };
  const head: React.CSSProperties = { ...cell, color: th.textMute, fontWeight: 700, fontSize: 12.5, textTransform: 'uppercase', letterSpacing: 0.4 };
  const actionBtn: React.CSSProperties = {
    border: `1px solid ${th.line}`, background: 'transparent', color: th.text,
    borderRadius: 9, padding: '6px 12px', cursor: 'pointer', fontSize: 13, fontWeight: 600,
  };

  return (
    <div>
      <h1 style={{ fontFamily: th.fontDisplay, fontSize: 28, fontWeight: 700, color: th.text, marginBottom: 20 }}>Clubs</h1>
      {error && (
        <div style={{ fontSize: 13.5, color: th.onAccent, background: th.accent, padding: '11px 14px', borderRadius: 12, fontWeight: 600, marginBottom: 16 }}>{error}</div>
      )}
      <div style={{ background: th.bgElev, border: `1px solid ${th.line}`, borderRadius: 14, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>
            <th style={{ ...head, textAlign: 'left' }}>Club</th>
            <th style={{ ...head, textAlign: 'left' }}>Gérant</th>
            <th style={{ ...head, textAlign: 'right' }}>Adhérents</th>
            <th style={{ ...head, textAlign: 'right' }}>Ressources</th>
            <th style={{ ...head, textAlign: 'left' }}>Statut</th>
            <th style={{ ...head, textAlign: 'right' }}>Actions</th>
          </tr></thead>
          <tbody>
            {clubs.map((c) => (
              <tr key={c.id}>
                <td style={cell}>
                  <strong>{c.name}</strong><br />
                  <span style={{ color: th.textFaint, fontSize: 12.5 }}>{c.slug}{c.city ? ` · ${c.city}` : ''}</span>
                  {c.aliases.length > 0 && (
                    <><br /><span style={{ color: th.textFaint, fontSize: 12 }}>Alias : {c.aliases.join(', ')}</span></>
                  )}
                </td>
                <td style={cell}>{c.owners[0]?.email ?? <span style={{ color: th.textFaint }}>—</span>}</td>
                <td style={{ ...cell, textAlign: 'right', fontFamily: th.fontMono }}>{c.counts.adherents}</td>
                <td style={{ ...cell, textAlign: 'right', fontFamily: th.fontMono }}>{c.counts.resources}</td>
                <td style={cell}>
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: c.status === 'ACTIVE' ? th.accent : th.textFaint }}>
                    {c.status === 'ACTIVE' ? 'Actif' : 'Suspendu'}
                  </span>
                </td>
                <td style={{ ...cell, textAlign: 'right', whiteSpace: 'nowrap' }}>
                  <button onClick={() => setSlugTarget(c)} style={{ ...actionBtn, marginRight: 8 }}>
                    Changer l&apos;alias
                  </button>
                  <button onClick={() => setPending(c)} style={actionBtn}>
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
            ? "Le club disparaîtra de l'annuaire public et sa page ne sera plus accessible."
            : "Le club redeviendra visible dans l'annuaire et sa page sera de nouveau accessible."}
          confirmLabel={pending.status === 'ACTIVE' ? 'Suspendre' : 'Réactiver'}
          busy={busy}
          onConfirm={applyStatus}
          onCancel={() => setPending(null)}
        />
      )}

      {slugTarget && (
        <ChangeSlugDialog
          club={slugTarget}
          onDone={() => { setSlugTarget(null); load(); }}
          onCancel={() => setSlugTarget(null)}
        />
      )}
    </div>
  );
}
```

Notes vérifiées sur le code existant :
- La partie liste/statut est l'existant **inchangé** (mêmes styles, même `applyStatus`) — seuls s'ajoutent `slugTarget`, le bouton « Changer l'alias », la sous-ligne Alias et le dialog.
- `Btn` : variante par défaut `primary`, variante `surface` existe (`atoms.tsx:71-75`). Pas de `danger` : l'action n'est pas destructive.
- Animations `sp-fade` / `sp-sheet-in-top` : déjà définies dans `frontend/app/globals.css` (utilisées par `ConfirmDialog`).
- `th.surface2`, `th.lineStrong`, `th.fontDisplay`, `th.fontMono`, `th.fontUI` existent dans `lib/theme.ts` (mêmes tokens que `ConfirmDialog`).

- [ ] **Step 4 : Vérifier le succès**

Run : `npx jest __tests__/SuperAdminClubsSlug.test.tsx` puis `npm test` (toute la suite frontend)
Expected : PASS.

- [ ] **Step 5 : Commit**

```bash
git add frontend/app/superadmin/clubs/page.tsx frontend/__tests__/SuperAdminClubsSlug.test.tsx
git commit -m "feat(alias): UI superadmin Changer l'alias (dialog, suggestion slugify, alias listes)"
```

---

### Task 8 : Documentation `CLAUDE.md`

**Files:**
- Modify: `CLAUDE.md` (insérer la section avant `## À implémenter`)

- [ ] **Step 1 : Ajouter la section**

```md
## Alias de club (changement de slug) (v1) ✅ implémenté

Seul le **super-admin plateforme** peut changer le slug/sous-domaine d'un club (`POST /api/platform/clubs/:id/slug`, `PlatformService.changeClubSlug`) — le gérant ne le peut pas, et **renommer un club ne touche jamais son slug** (l'UI superadmin propose `slugify(nom)` comme suggestion). L'ancien slug devient un **alias permanent** (`ClubSlugAlias`, PK = slug, migration `add_club_slug_aliases`) : `<ancien>.palova.fr` **redirige en 308** vers `<nouveau>.palova.fr` en conservant chemin + query (résolution `GET /api/clubs/_resolve/:slug` appelée par `app/layout.tsx`, chemin transmis via l'en-tête `x-club-path` posé par `proxy.ts` ; fetch non caché → pas de boucle après swap-back). Les alias restent **réservés à vie** (refusés à la création de club et au changement de slug, erreur `SLUG_TAKEN`), sauf pour le club lui-même qui peut **reprendre son propre ancien alias** (swap-back : la ligne d'alias est supprimée). Libellés interdits `RESERVED_SLUGS` (www/app/api/superadmin, erreur `SLUG_RESERVED` 400 ; `SLUG_INVALID` 400 si slugify vide). UI : bouton « Changer l'alias » dans `/superadmin/clubs` (dialog avec aperçu de la nouvelle URL + liste des alias existants via `PlatformClub.aliases`, miroir front `lib/slug.ts`). Certificats : aucun travail — `/internal/tls-check` autorise déjà tout `*.palova.fr`. Plan : `docs/superpowers/plans/2026-06-12-changement-alias-sous-domaine.md`.
```

- [ ] **Step 2 : Commit**

```bash
git add CLAUDE.md
git commit -m "docs(alias): section changement d'alias de club dans CLAUDE.md"
```

---

### Task 9 : Vérification finale bout en bout

- [ ] **Step 1 : Suites complètes**

Run : `cd backend && npm test` puis `cd frontend && npm test`
Expected : PASS partout.

- [ ] **Step 2 : Vérification manuelle** (dev : Docker up, backend :3001, frontend :3000 — les sous-domaines `*.localhost` marchent nativement dans Chrome/Edge)

1. Se connecter en `super@palova.fr` sur `http://localhost:3000` → `/superadmin/clubs` → « Changer l'alias » sur le club seedé (`padel-arena-paris`) → saisir `arena-test` → confirmer. La liste affiche le nouveau slug + « Alias : padel-arena-paris ».
2. `curl -sI "http://padel-arena-paris.localhost:3000/reserver?date=2026-06-15"` → **308** avec `Location: http://arena-test.localhost:3000/reserver?date=2026-06-15`.
3. `http://arena-test.localhost:3000/` → club-house normal.
4. Tenter de créer un club nommé « Padel Arena Paris » → erreur SLUG_TAKEN (alias réservé à vie).
5. Re-changer l'alias vers `padel-arena-paris` (**swap-back**) → accepté ; `arena-test` devient l'alias, la redirection s'inverse, **pas de boucle**.
6. Slug `www` → « réservé par la plateforme » ; slug d'un autre club → « déjà utilisé ».

- [ ] **Step 3 : Clore la branche**

Utiliser le skill `superpowers:finishing-a-development-branch` (merge/PR selon le choix de l'utilisateur).
