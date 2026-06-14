# Catalogue des sports (superadmin) — durées & surfaces — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Donner au superadmin un CRUD du catalogue des sports (durées proposées + surfaces/matériaux), puis brancher les matériaux + un indicateur « Couvert » sur les terrains des clubs.

**Architecture :** Le modèle `Sport` existe déjà ; on ajoute une seule colonne `surfaces String[]`. Le CRUD passe par un nouveau `SportCatalogService` exposé sur le routeur `platform` (déjà protégé superadmin). Côté front, une page `superadmin/sports` (liste + formulaire), puis l'admin courts lit les matériaux du sport et écrit `attributes.covered`.

**Tech Stack :** Express + Prisma 7 (adapter-pg), Jest + supertest + jest-mock-extended (Prisma mocké), Next.js 16 (App Router, composants `'use client'`), TypeScript.

**Avant de commencer :** créer une branche (`git checkout -b feat/sports-catalog`) — l'utilisateur développe en parallèle. Lancer les tests back depuis `backend/` (`npm test`) et front depuis `frontend/` (`npm test`).

**Spec de référence :** `docs/superpowers/specs/2026-06-14-superadmin-sports-catalog-design.md`

---

## Phase 1 — Backend : colonne `surfaces` + CRUD catalogue

### Task 1 : Migration `Sport.surfaces`

**Files:**
- Modify: `backend/prisma/schema.prisma` (modèle `Sport`, après `defaultDurationsMin`)
- Create: `backend/prisma/migrations/20260614140000_add_sport_surfaces/migration.sql`

- [ ] **Step 1 : Ajouter le champ au schéma**

Dans `model Sport`, sous la ligne `defaultDurationsMin Int[] ...`, ajouter :

```prisma
  surfaces            String[] @default([])
```

- [ ] **Step 2 : Écrire la migration SQL**

`backend/prisma/migrations/20260614140000_add_sport_surfaces/migration.sql` :

```sql
-- Matériaux proposés par sport (béton poreux, résine…). Additif, défaut vide.
ALTER TABLE "sports" ADD COLUMN "surfaces" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
```

- [ ] **Step 3 : Appliquer + régénérer le client**

Run: `cd backend && npx prisma migrate deploy && npx prisma generate`
Expected: « 1 migration ... applied » puis « Generated Prisma Client ».

- [ ] **Step 4 : Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations/20260614140000_add_sport_surfaces
git commit -m "feat(sports): colonne Sport.surfaces (matériaux)"
```

### Task 2 : `SportCatalogService` (create/update/delete) — TDD via les routes

On teste au niveau route (pattern maison : Prisma mocké). Le service est créé pour faire passer les tests.

**Files:**
- Create: `backend/src/services/sport-catalog.service.ts`
- Modify: `backend/src/routes/platform.ts`
- Test: `backend/src/routes/__tests__/platform.sports.routes.test.ts`

- [ ] **Step 1 : Écrire les tests qui échouent**

`backend/src/routes/__tests__/platform.sports.routes.test.ts` :

```ts
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
```

- [ ] **Step 2 : Lancer → échec attendu**

Run: `cd backend && npm test -- platform.sports.routes`
Expected: FAIL (route 404 / service inexistant).

- [ ] **Step 3 : Créer le service**

`backend/src/services/sport-catalog.service.ts` :

```ts
import { Prisma } from '@prisma/client';
import { prisma } from '../db/prisma';
import { slugify } from './club.service';

const RESOURCE_NOUNS = ['terrain', 'court', 'table', 'piste', 'baie'];

export interface SportInput {
  name?: unknown; key?: unknown; icon?: unknown; resourceNoun?: unknown;
  defaultSlotStepMin?: unknown; defaultDurationsMin?: unknown; surfaces?: unknown;
}

function parseDurations(v: unknown): number[] {
  if (!Array.isArray(v)) throw new Error('VALIDATION_ERROR');
  const out = v.map(Number);
  if (out.length === 0 || out.some((n) => !Number.isInteger(n) || n <= 0)) throw new Error('VALIDATION_ERROR');
  return Array.from(new Set(out)).sort((a, b) => a - b);
}
function parseSurfaces(v: unknown): string[] {
  if (v === undefined) return [];
  if (!Array.isArray(v)) throw new Error('VALIDATION_ERROR');
  return Array.from(new Set(v.map((s) => String(s).trim()).filter(Boolean)));
}
function parseNoun(v: unknown): string {
  const n = typeof v === 'string' ? v : 'terrain';
  if (!RESOURCE_NOUNS.includes(n)) throw new Error('VALIDATION_ERROR');
  return n;
}
function parseStep(v: unknown): number {
  const n = v === undefined ? 30 : Number(v);
  if (!Number.isInteger(n) || n <= 0) throw new Error('VALIDATION_ERROR');
  return n;
}

export class SportCatalogService {
  async createSport(input: SportInput) {
    const name = (typeof input.name === 'string' ? input.name : '').trim();
    if (!name) throw new Error('VALIDATION_ERROR');
    const key = slugify(typeof input.key === 'string' && input.key.trim() ? input.key : name);
    if (!key) throw new Error('VALIDATION_ERROR');
    try {
      return await prisma.sport.create({
        data: {
          key, name,
          icon: typeof input.icon === 'string' && input.icon.trim() ? input.icon.trim() : null,
          resourceNoun: parseNoun(input.resourceNoun),
          defaultSlotStepMin: parseStep(input.defaultSlotStepMin),
          defaultDurationsMin: parseDurations(input.defaultDurationsMin),
          surfaces: parseSurfaces(input.surfaces),
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') throw new Error('SPORT_KEY_TAKEN');
      throw err;
    }
  }

  async updateSport(id: string, input: SportInput) {
    const data: Prisma.SportUpdateInput = {};
    if (input.name !== undefined) {
      const name = (typeof input.name === 'string' ? input.name : '').trim();
      if (!name) throw new Error('VALIDATION_ERROR');
      data.name = name;
    }
    if (input.icon !== undefined) data.icon = typeof input.icon === 'string' && input.icon.trim() ? input.icon.trim() : null;
    if (input.resourceNoun !== undefined) data.resourceNoun = parseNoun(input.resourceNoun);
    if (input.defaultSlotStepMin !== undefined) data.defaultSlotStepMin = parseStep(input.defaultSlotStepMin);
    if (input.defaultDurationsMin !== undefined) data.defaultDurationsMin = parseDurations(input.defaultDurationsMin);
    if (input.surfaces !== undefined) data.surfaces = parseSurfaces(input.surfaces);
    // `key` volontairement jamais repris : identifiant immuable.
    try {
      return await prisma.sport.update({ where: { id }, data });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') throw new Error('SPORT_NOT_FOUND');
      throw err;
    }
  }

  async deleteSport(id: string) {
    if ((await prisma.clubSport.count({ where: { sportId: id } })) > 0) throw new Error('SPORT_IN_USE');
    try {
      await prisma.sport.delete({ where: { id } });
      return { id };
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') throw new Error('SPORT_NOT_FOUND');
      throw err;
    }
  }
}
```

- [ ] **Step 4 : Brancher les routes**

Dans `backend/src/routes/platform.ts` : importer le service et l'instancier, ajouter les codes d'erreur et 3 routes.

En tête (après l'import `PlatformService`) :

```ts
import { SportCatalogService } from '../services/sport-catalog.service';
```

Après `const platform = new PlatformService();` :

```ts
const sportCatalog = new SportCatalogService();
```

Dans `ERROR_STATUS`, ajouter :

```ts
  SPORT_KEY_TAKEN: 409,
  SPORT_IN_USE:    409,
  SPORT_NOT_FOUND: 404,
```

Avant `export default router;` :

```ts
router.post('/sports', async (req, res, next) => {
  try { res.status(201).json(await sportCatalog.createSport(req.body)); }
  catch (err) { handleError(err, res, next); }
});

router.patch('/sports/:id', async (req, res, next) => {
  try { res.json(await sportCatalog.updateSport(req.params.id, req.body)); }
  catch (err) { handleError(err, res, next); }
});

router.delete('/sports/:id', async (req, res, next) => {
  try { res.json(await sportCatalog.deleteSport(req.params.id)); }
  catch (err) { handleError(err, res, next); }
});
```

- [ ] **Step 5 : Lancer → succès attendu**

Run: `cd backend && npm test -- platform.sports.routes`
Expected: PASS (tous les `it`).

- [ ] **Step 6 : Commit**

```bash
git add backend/src/services/sport-catalog.service.ts backend/src/routes/platform.ts backend/src/routes/__tests__/platform.sports.routes.test.ts
git commit -m "feat(platform): CRUD catalogue des sports (durées + surfaces)"
```

### Task 3 : Exposer `surfaces` dans les selects Prisma

Le client doit recevoir `surfaces` partout où il lit un sport.

**Files:**
- Modify: `backend/src/routes/sports.ts:12-13`
- Modify: `backend/src/services/club.service.ts:147`

- [ ] **Step 1 : GET /api/sports**

Dans `backend/src/routes/sports.ts`, dans le `select`, ajouter `surfaces: true` :

```ts
      select: {
        id: true, key: true, name: true, resourceNoun: true,
        defaultSlotStepMin: true, defaultDurationsMin: true, icon: true, surfaces: true,
      },
```

- [ ] **Step 2 : Liste des sports du club (admin)**

Dans `backend/src/services/club.service.ts:147`, étendre le `select` du sport :

```ts
            sport: { select: { id: true, key: true, name: true, resourceNoun: true, defaultSlotStepMin: true, defaultDurationsMin: true, icon: true, surfaces: true } },
```

- [ ] **Step 3 : Vérifier que rien ne casse**

Run: `cd backend && npm test`
Expected: PASS (suite back complète).

- [ ] **Step 4 : Commit**

```bash
git add backend/src/routes/sports.ts backend/src/services/club.service.ts
git commit -m "feat(sports): exposer surfaces dans les selects sport"
```

---

## Phase 2 — Frontend : page superadmin catalogue

### Task 4 : Client API (types + helpers)

**Files:**
- Modify: `frontend/lib/api.ts` (interface `Sport` ~408 ; `AdminClubSport.sport` ~691 ; objet `api` ~387-404 ; types)

- [ ] **Step 1 : Étendre les types**

Interface `Sport` — ajouter `surfaces` :

```ts
export interface Sport {
  id: string;
  key: string;
  name: string;
  resourceNoun: string;
  defaultSlotStepMin: number;
  defaultDurationsMin: number[];
  icon: string | null;
  surfaces: string[];
}
```

Interface `AdminClubSport` (~691), dans `sport: { ... }`, ajouter `surfaces: string[]` :

```ts
  sport: { id: string; key: string; name: string; resourceNoun: string; defaultDurationsMin: number[]; surfaces: string[] };
```

- [ ] **Step 2 : Ajouter le body type + helpers**

Juste avant la fermeture de l'objet `api` (après `platformCreateClub: ...`), ajouter :

```ts
  platformCreateSport: (body: SportCatalogBody, token: string) =>
    request<Sport>('/api/platform/sports', { method: 'POST', body: JSON.stringify(body) }, token),
  platformUpdateSport: (id: string, body: SportCatalogBody, token: string) =>
    request<Sport>(`/api/platform/sports/${id}`, { method: 'PATCH', body: JSON.stringify(body) }, token),
  platformDeleteSport: (id: string, token: string) =>
    request<{ id: string }>(`/api/platform/sports/${id}`, { method: 'DELETE' }, token),
```

Dans la zone `// --- Types ---`, ajouter :

```ts
export interface SportCatalogBody {
  name: string;
  icon?: string;
  resourceNoun: string;
  defaultSlotStepMin: number;
  defaultDurationsMin: number[];
  surfaces: string[];
}
```

- [ ] **Step 3 : Vérifier la compilation TS**

Run: `cd frontend && npx tsc --noEmit`
Expected: pas d'erreur liée à `api.ts` (des erreurs préexistantes ailleurs sont hors périmètre).

- [ ] **Step 4 : Commit**

```bash
git add frontend/lib/api.ts
git commit -m "feat(api): types & helpers CRUD sports plateforme"
```

### Task 5 : Lien de nav superadmin

**Files:**
- Modify: `frontend/app/superadmin/layout.tsx:40-44`

- [ ] **Step 1 : Ajouter le lien Sports**

Dans le tableau `links`, après l'entrée `Clubs` :

```ts
    { href: '/superadmin/sports', label: 'Sports', icon: 'trophy' as const },
```

- [ ] **Step 2 : Commit**

```bash
git add frontend/app/superadmin/layout.tsx
git commit -m "feat(superadmin): lien de nav vers le catalogue sports"
```

### Task 6 : Page `superadmin/sports` (liste + formulaire)

**Files:**
- Create: `frontend/app/superadmin/sports/page.tsx`

- [ ] **Step 1 : Écrire la page**

`frontend/app/superadmin/sports/page.tsx` :

```tsx
'use client';
import { useState, useEffect, useCallback } from 'react';
import { api, Sport, SportCatalogBody } from '@/lib/api';
import { useAuth } from '@/lib/useAuth';
import { useTheme } from '@/lib/ThemeProvider';
import { durationLabel } from '@/lib/duration';
import { Btn, Field } from '@/components/ui/atoms';

const NOUNS = ['terrain', 'court', 'table', 'piste', 'baie'];
const DURATION_PRESETS = [30, 45, 60, 90, 120];
const STEP_OPTIONS = [15, 30, 60];
const emptyForm = (): SportCatalogBody => ({ name: '', icon: '', resourceNoun: 'terrain', defaultSlotStepMin: 30, defaultDurationsMin: [60, 90], surfaces: [] });

export default function SuperAdminSportsPage() {
  const { th } = useTheme();
  const { token, ready } = useAuth();
  const [sports, setSports]   = useState<Sport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [editId, setEditId]   = useState<string | null>(null); // null = pas de form ; '' = création ; id = édition
  const [form, setForm]       = useState<SportCatalogBody>(emptyForm());
  const [surfaceInput, setSurfaceInput] = useState('');
  const [otherDuration, setOtherDuration] = useState('');
  const [busy, setBusy]       = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { setError(null); setSports(await api.getSports()); }
    catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { if (ready) load(); }, [ready, load]);

  const startCreate = () => { setForm(emptyForm()); setEditId(''); setSurfaceInput(''); setOtherDuration(''); };
  const startEdit = (s: Sport) => {
    setForm({ name: s.name, icon: s.icon ?? '', resourceNoun: s.resourceNoun, defaultSlotStepMin: s.defaultSlotStepMin, defaultDurationsMin: [...s.defaultDurationsMin], surfaces: [...s.surfaces] });
    setEditId(s.id); setSurfaceInput(''); setOtherDuration('');
  };

  const toggleDuration = (m: number) => setForm((f) => ({ ...f, defaultDurationsMin: f.defaultDurationsMin.includes(m) ? f.defaultDurationsMin.filter((x) => x !== m) : [...f.defaultDurationsMin, m].sort((a, b) => a - b) }));
  const addOther = () => { const n = Number(otherDuration); if (Number.isInteger(n) && n > 0 && !form.defaultDurationsMin.includes(n)) setForm((f) => ({ ...f, defaultDurationsMin: [...f.defaultDurationsMin, n].sort((a, b) => a - b) })); setOtherDuration(''); };
  const addSurface = () => { const s = surfaceInput.trim(); if (s && !form.surfaces.includes(s)) setForm((f) => ({ ...f, surfaces: [...f.surfaces, s] })); setSurfaceInput(''); };
  const removeSurface = (s: string) => setForm((f) => ({ ...f, surfaces: f.surfaces.filter((x) => x !== s) }));

  const save = async () => {
    if (!token) return;
    if (!form.name.trim() || form.defaultDurationsMin.length === 0) { setError('Nom requis et au moins une durée.'); return; }
    setBusy(true);
    try {
      setError(null);
      if (editId) await api.platformUpdateSport(editId, form, token);
      else await api.platformCreateSport(form, token);
      setEditId(null); await load();
    } catch (e) {
      const m = (e as Error).message;
      setError(m === 'SPORT_KEY_TAKEN' ? 'Un sport avec ce nom existe déjà.' : m === 'VALIDATION_ERROR' ? 'Champs invalides.' : 'Enregistrement impossible.');
    } finally { setBusy(false); }
  };

  const remove = async (s: Sport) => {
    if (!token || !window.confirm(`Supprimer « ${s.name} » du catalogue ?`)) return;
    setBusy(true);
    try { setError(null); await api.platformDeleteSport(s.id, token); await load(); }
    catch (e) { const m = (e as Error).message; setError(m === 'SPORT_IN_USE' ? `« ${s.name} » est utilisé par au moins un club : suppression impossible.` : 'Suppression impossible.'); }
    finally { setBusy(false); }
  };

  const chip = (on: boolean) => ({ border: on ? 'none' : `1px solid ${th.line}`, cursor: 'pointer', borderRadius: 9, padding: '7px 12px', fontFamily: th.fontUI, fontSize: 13, fontWeight: 600, background: on ? th.accent : 'transparent', color: on ? th.onAccent : th.textMute }) as React.CSSProperties;
  const card: React.CSSProperties = { background: th.surface, borderRadius: 18, padding: 22, boxShadow: `inset 0 0 0 1px ${th.line}`, marginBottom: 16 };
  const sel: React.CSSProperties = { border: `1px solid ${th.line}`, background: th.bg, color: th.text, borderRadius: 9, padding: '9px 11px', fontFamily: th.fontUI, fontSize: 14 };

  return (
    <div style={{ maxWidth: 720 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <h1 style={{ fontFamily: th.fontDisplay, fontWeight: 700, fontSize: 28, color: th.text, margin: 0 }}>Catalogue des sports</h1>
        {editId === null && <Btn onClick={startCreate}>Ajouter un sport</Btn>}
      </div>

      {error && <div style={{ marginBottom: 16, background: th.accent, color: th.onAccent, borderRadius: 12, padding: '11px 14px', fontFamily: th.fontUI, fontSize: 13.5, fontWeight: 600 }}>{error}</div>}

      {editId !== null && (
        <div style={card}>
          <h2 style={{ fontFamily: th.fontDisplay, fontWeight: 600, fontSize: 20, margin: '0 0 16px', color: th.text }}>{editId ? 'Modifier le sport' : 'Nouveau sport'}</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Field label="Nom" value={form.name} onChange={(v) => setForm((f) => ({ ...f, name: v }))} required />
            <Field label="Icône (emoji)" value={form.icon ?? ''} onChange={(v) => setForm((f) => ({ ...f, icon: v }))} placeholder="🎾" />
            <label style={{ fontFamily: th.fontUI, fontSize: 12.5, fontWeight: 600, color: th.textMute, display: 'flex', flexDirection: 'column', gap: 5 }}>Type de ressource
              <select value={form.resourceNoun} onChange={(e) => setForm((f) => ({ ...f, resourceNoun: e.target.value }))} style={sel}>
                {NOUNS.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
            <label style={{ fontFamily: th.fontUI, fontSize: 12.5, fontWeight: 600, color: th.textMute, display: 'flex', flexDirection: 'column', gap: 5 }}>Pas du créneau (min)
              <select value={form.defaultSlotStepMin} onChange={(e) => setForm((f) => ({ ...f, defaultSlotStepMin: Number(e.target.value) }))} style={sel}>
                {STEP_OPTIONS.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>

            <div>
              <span style={{ fontFamily: th.fontUI, fontSize: 12.5, fontWeight: 600, color: th.textMute, display: 'block', marginBottom: 7 }}>Durées proposées</span>
              <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', alignItems: 'center' }}>
                {Array.from(new Set([...DURATION_PRESETS, ...form.defaultDurationsMin])).sort((a, b) => a - b).map((m) => (
                  <button key={m} type="button" onClick={() => toggleDuration(m)} style={chip(form.defaultDurationsMin.includes(m))}>{durationLabel(m)}</button>
                ))}
                <input value={otherDuration} onChange={(e) => setOtherDuration(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addOther(); } }} placeholder="Autre…" inputMode="numeric" style={{ ...sel, width: 90 }} />
                <button type="button" onClick={addOther} style={chip(false)}>+</button>
              </div>
            </div>

            <div>
              <span style={{ fontFamily: th.fontUI, fontSize: 12.5, fontWeight: 600, color: th.textMute, display: 'block', marginBottom: 7 }}>Surfaces (matériaux)</span>
              <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
                {form.surfaces.map((s) => (
                  <span key={s} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, ...chip(true) }}>
                    {s}<button type="button" onClick={() => removeSurface(s)} aria-label={`Retirer ${s}`} style={{ border: 'none', background: 'transparent', color: th.onAccent, cursor: 'pointer', fontSize: 15, lineHeight: 1 }}>×</button>
                  </span>
                ))}
                {form.surfaces.length === 0 && <span style={{ fontFamily: th.fontUI, fontSize: 13, color: th.textFaint }}>Aucun matériau (facultatif).</span>}
              </div>
              <div style={{ display: 'flex', gap: 7 }}>
                <input value={surfaceInput} onChange={(e) => setSurfaceInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addSurface(); } }} placeholder="Ajouter un matériau (ex. Béton poreux)" style={{ ...sel, flex: 1 }} />
                <button type="button" onClick={addSurface} style={chip(false)}>Ajouter</button>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 11, marginTop: 6 }}>
              <Btn variant="surface" onClick={() => setEditId(null)} disabled={busy}>Annuler</Btn>
              <Btn onClick={save} disabled={busy}>{busy ? '…' : 'Enregistrer'}</Btn>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ fontFamily: th.fontUI, color: th.textFaint, padding: '32px 0' }}>Chargement…</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {sports.map((s) => (
            <div key={s.id} style={{ ...card, marginBottom: 0, display: 'flex', alignItems: 'center', gap: 14 }}>
              <span style={{ fontSize: 22 }}>{s.icon ?? '•'}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: th.fontUI, fontWeight: 700, fontSize: 16, color: th.text }}>{s.name} <span style={{ color: th.textFaint, fontWeight: 400 }}>· {s.resourceNoun}</span></div>
                <div style={{ fontFamily: th.fontUI, fontSize: 13, color: th.textMute, marginTop: 3 }}>
                  Durées : {s.defaultDurationsMin.map(durationLabel).join(', ')}
                  {s.surfaces.length > 0 && <> · Surfaces : {s.surfaces.join(', ')}</>}
                </div>
              </div>
              <Btn variant="surface" onClick={() => startEdit(s)}>Modifier</Btn>
              <Btn variant="danger" onClick={() => remove(s)} disabled={busy}>Suppr.</Btn>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2 : Vérifier en dev (manuel)**

Run: ouvrir `http://localhost:3000/superadmin/sports` (hôte plateforme, connecté super-admin `super@palova.fr`).
Expected: liste des 6 sports ; « Ajouter un sport » ouvre le formulaire ; création + édition + suppression fonctionnent (suppression d'un sport utilisé → message `SPORT_IN_USE`).

- [ ] **Step 3 : Commit**

```bash
git add frontend/app/superadmin/sports/page.tsx
git commit -m "feat(superadmin): page catalogue sports (durées + surfaces)"
```

---

## Phase 3 — Terrains : matériau (depuis le sport) + « Couvert »

### Task 7 : Backfill `attributes` des terrains existants

**Files:**
- Create: `backend/prisma/migrations/20260614150000_backfill_resource_covered/migration.sql`

- [ ] **Step 1 : Écrire la migration de backfill**

`backend/prisma/migrations/20260614150000_backfill_resource_covered/migration.sql` :

```sql
-- L'ancien attributes.surface valait indoor|outdoor (= couvert/découvert), pas un matériau.
-- On le convertit en attributes.covered (booléen) et on retire la clé surface
-- (le matériau sera re-choisi par l'admin parmi les surfaces du sport).
UPDATE "resources"
SET "attributes" = ("attributes" - 'surface')
  || jsonb_build_object('covered', ("attributes" ->> 'surface') = 'indoor')
WHERE "attributes" ? 'surface';
```

- [ ] **Step 2 : Appliquer**

Run: `cd backend && npx prisma migrate deploy`
Expected: migration appliquée.

- [ ] **Step 3 : Vérifier en base**

Run: `docker exec palova_postgres_1 psql -U palovauser -d palova -c "SELECT name, attributes FROM resources LIMIT 5;"`
Expected: chaque terrain a `attributes.covered` (true/false) et plus de clé `surface` (sauf matériaux re-saisis).

- [ ] **Step 4 : Commit**

```bash
git add backend/prisma/migrations/20260614150000_backfill_resource_covered
git commit -m "chore(resources): backfill attributes.covered depuis indoor/outdoor"
```

### Task 8 : `lib/courtType.ts` — séparer couvert et matériau

**Files:**
- Modify: `frontend/lib/courtType.ts`

- [ ] **Step 1 : Remplacer `courtType`/`SURFACE_TYPES` par un helper « couvert »**

Remplacer les lignes 3-8 (`courtType`) et 23-26 (`SURFACE_TYPES`) par :

```ts
/** Couvert / découvert (attributes.covered). */
export function coveredType(covered?: boolean): { label: string; icon: IconName; color: string } {
  return covered
    ? { label: 'Couvert', icon: 'indoor', color: '#5e93da' }   // bleu Palova
    : { label: 'Découvert', icon: 'sun', color: '#ef9f6a' };    // apricot (soleil)
}
```

(Garder `courtFormat`, `SINGLE_COLOR`, `playerCount`, `COURT_FORMATS` inchangés.)

- [ ] **Step 2 : Mettre à jour les 2 affichages booking**

`frontend/app/courts/[id]/page.tsx:87` — remplacer :

```ts
  const ct = courtType(typeof resource?.attributes?.surface === 'string' ? resource.attributes.surface : undefined);
```

par :

```ts
  const ct = coveredType(resource?.attributes?.covered === true);
```

et l'import ligne 16 : `import { coveredType, courtFormat } from '@/lib/courtType';`

`frontend/components/ClubReserve.tsx` — import ligne 9 : remplacer `courtType` par `coveredType` ; lignes 165 et 212, remplacer :

```ts
const ct = courtType(typeof resource.attributes?.surface === 'string' ? resource.attributes.surface : undefined);
```

(et l'équivalent ligne 212 avec `r.attributes`) par :

```ts
const ct = coveredType(resource.attributes?.covered === true); // ligne 165
const ct = coveredType(r.attributes?.covered === true);        // ligne 212
```

Le badge matériau s'affiche à côté en lisant `attributes.surface` (chaîne) quand présent — ajouter près du rendu de `ct` (même bloc) :

```tsx
{typeof resource.attributes?.surface === 'string' && resource.attributes.surface && (
  <span style={{ fontFamily: th.fontUI, fontSize: 12, color: th.textMute }}>{resource.attributes.surface}</span>
)}
```

- [ ] **Step 3 : Compilation**

Run: `cd frontend && npx tsc --noEmit`
Expected: aucune erreur sur `courtType` (plus référencé).

- [ ] **Step 4 : Commit**

```bash
git add frontend/lib/courtType.ts frontend/app/courts/[id]/page.tsx frontend/components/ClubReserve.tsx
git commit -m "feat(courts): badge couvert/découvert séparé du matériau"
```

### Task 9 : Admin courts — matériau depuis le sport + case « Couvert »

**Files:**
- Modify: `frontend/app/admin/courts/page.tsx`

- [ ] **Step 1 : Remplacer le select Surface (création + ligne) et ajouter Couvert**

Contexte : `nr` (nouveau terrain, ~ligne 23) et `editAttr` (~ligne 59) gèrent `attributes`. `sports` (liste `AdminClubSport`) est chargé. Pour un terrain, le sport est `clubSport.sport` (déjà dans `AdminResource`).

(a) Import — supprimer `SURFACE_TYPES` de l'import ligne 7 : `import { COURT_FORMATS } from '@/lib/courtType';`

(b) État `nr` (~ligne 23) — remplacer `surface: 'indoor'` par un matériau vide + couvert :

```ts
  const [nr, setNr] = useState({ name: '', clubSportId: '', surface: '', covered: false, format: 'double', price: '25', offPeakPrice: '', openHour: '8', closeHour: '22', slotStepMin: '' });
```

(c) Helper : surfaces du sport sélectionné pour le formulaire de création :

```ts
  const surfacesFor = (clubSportId: string) => sports.find((s) => s.id === clubSportId)?.sport.surfaces ?? [];
```

(d) Select Surface du **formulaire de création** (~ligne 228-231) — remplacer par un select alimenté par le sport (masqué si aucune surface) + une case Couvert :

```tsx
          {surfacesFor(nr.clubSportId).length > 0 && (
            <label style={label}>Surface
              <select value={nr.surface} onChange={(e) => setNr({ ...nr, surface: e.target.value })} style={input}>
                <option value="">—</option>
                {surfacesFor(nr.clubSportId).map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
          )}
          <label style={{ ...label, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <input type="checkbox" checked={nr.covered} onChange={(e) => setNr({ ...nr, covered: e.target.checked })} /> Couvert
          </label>
```

(e) À la création (`adminCreateResource`, ~ligne 127), passer le matériau + couvert dans `attributes` :

```ts
        clubSportId: nr.clubSportId, name: nr.name, attributes: { surface: nr.surface || undefined, covered: nr.covered, format: nr.format },
```

et le reset (~ligne 133) repasse `surface: '', covered: false`.

(f) Select Surface de la **ligne du tableau** (~ligne 184-186) — alimenter par les surfaces du sport du terrain et ajouter une case Couvert dans la même cellule :

```tsx
                    {(r.clubSport.sport.surfaces ?? []).length > 0 && (
                      <select value={typeof r.attributes?.surface === 'string' ? r.attributes.surface : ''} onChange={(e) => editAttr(r.id, 'surface', e.target.value)} style={{ ...input, width: 110 }}>
                        <option value="">—</option>
                        {(r.clubSport.sport.surfaces ?? []).map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    )}
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginLeft: 8, fontSize: 13 }}>
                      <input type="checkbox" checked={r.attributes?.covered === true} onChange={(e) => editCovered(r.id, e.target.checked)} /> Couvert
                    </label>
```

(g) Ajouter le helper `editCovered` à côté de `editAttr` (~ligne 59) :

```ts
  const editCovered = (id: string, covered: boolean) => {
    setResources((prev) => prev.map((r) => (r.id === id ? { ...r, attributes: { ...r.attributes, covered } } : r)));
    markDirty(id);
  };
```

(h) `AdminResource.clubSport.sport` doit exposer `surfaces`. Dans `frontend/lib/api.ts` (~ligne 704), ajouter `surfaces: string[]` au sport de `AdminResource.clubSport.sport`, et côté back ajouter `surfaces: true` au select `backend/src/services/resource.service.ts:69` (`sport: { select: { ..., surfaces: true } }`).

- [ ] **Step 2 : Vérifier en dev (manuel)**

Run: ouvrir `http://<club>.localhost:3000/admin/courts` (gérant).
Expected : pour un sport ayant des surfaces, le select propose les matériaux du sport ; la case « Couvert » se coche et se sauvegarde (recharger la page confirme la persistance).

- [ ] **Step 3 : Commit**

```bash
git add frontend/app/admin/courts/page.tsx frontend/lib/api.ts backend/src/services/resource.service.ts
git commit -m "feat(courts): matériau issu du sport + case Couvert"
```

---

## Phase 4 — Raccord durées côté club

### Task 10 : Les puces durées du club dérivent du sport

**Files:**
- Modify: `frontend/lib/duration.ts`
- Modify: `frontend/app/admin/sports/page.tsx`
- Test: `frontend/__tests__/duration.test.ts` (créer si absent)

- [ ] **Step 1 : Test du helper**

`frontend/__tests__/duration.test.ts` :

```ts
import { proposableDurations } from '@/lib/duration';

describe('proposableDurations', () => {
  it('réunit presets et durées du sport, triées et dédupliquées', () => {
    expect(proposableDurations([45, 90])).toEqual([30, 45, 60, 90, 120]);
    expect(proposableDurations([150])).toEqual([30, 60, 90, 120, 150]);
    expect(proposableDurations([])).toEqual([30, 60, 90, 120]);
  });
});
```

- [ ] **Step 2 : Lancer → échec**

Run: `cd frontend && npm test -- duration`
Expected: FAIL (`proposableDurations` non exporté).

- [ ] **Step 3 : Implémenter le helper**

Dans `frontend/lib/duration.ts`, après `ALLOWED_DURATIONS`, ajouter :

```ts
/** Presets affichés côté club pour cocher les durées d'un sport. */
const DURATION_PRESETS = [30, 60, 90, 120];

/** Durées cochables d'un sport : presets ∪ durées par défaut du sport (triées, dédupliquées). */
export function proposableDurations(sportDefaults: number[]): number[] {
  return Array.from(new Set([...DURATION_PRESETS, ...sportDefaults])).sort((a, b) => a - b);
}
```

- [ ] **Step 4 : Lancer → succès**

Run: `cd frontend && npm test -- duration`
Expected: PASS.

- [ ] **Step 5 : Utiliser le helper dans la page club**

Dans `frontend/app/admin/sports/page.tsx` : importer `proposableDurations` (ligne 7, ajouter à l'import depuis `@/lib/duration`), puis remplacer la boucle `ALLOWED_DURATIONS.map(...)` (~ligne 77) par `proposableDurations(e.sport.defaultDurationsMin).map(...)`.

```tsx
                        {proposableDurations(e.sport.defaultDurationsMin).map((m) => {
```

- [ ] **Step 6 : Vérifier suite front**

Run: `cd frontend && npm test`
Expected: PASS.

- [ ] **Step 7 : Commit**

```bash
git add frontend/lib/duration.ts frontend/app/admin/sports/page.tsx frontend/__tests__/duration.test.ts
git commit -m "feat(club-sports): durées cochables dérivées du sport"
```

---

## Vérification finale

- [ ] `cd backend && npm test` — vert.
- [ ] `cd frontend && npm test` — vert.
- [ ] `cd frontend && npx tsc --noEmit` — pas de nouvelle erreur.
- [ ] Parcours manuel : superadmin crée « Tennis » avec matériaux [Béton poreux, Résine] → un club active Tennis → admin courts : 1 terrain « Béton poreux », 4 « Résine » dont 2 « Couvert » → la réservation affiche matériau + couvert/découvert.

## Couverture du spec

- Colonne `Sport.surfaces` + migration additive → Task 1.
- CRUD `/api/platform/sports` + validations + `SPORT_IN_USE`/`SPORT_KEY_TAKEN` + clé immuable → Task 2.
- `surfaces` exposé dans les selects → Tasks 3 & 9(h).
- Page superadmin (liste + form durées & matériaux) + nav → Tasks 4-6.
- Terrains : `attributes.surface`=matériau + `attributes.covered`, backfill, select depuis le sport, case Couvert, affichage → Tasks 7-9.
- Raccord durées club → Task 10.
