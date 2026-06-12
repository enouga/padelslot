# Installation PWA avec identité par club — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rendre Palova installable comme web app, avec le nom/couleur/logo du club sur son sous-domaine, et une entrée « Installer l'application » dans le menu profil.

**Architecture:** Manifest Next dynamique par hôte (`app/manifest.ts` + `headers()`), icônes club générées par le backend (sharp, cache disque `uploads/icons`, fallback Palova embarqué), UX d'installation via hook `beforeinstallprompt` + tutoriel iOS. Spec : `docs/superpowers/specs/2026-06-12-pwa-install-design.md`.

**Tech Stack:** Next.js 16 (manifest route), Express 5, sharp, Prisma 7 (lecture club), Jest + RTL + supertest.

**Conventions transverses :** tests front lancés depuis `frontend/` (`npx jest <fichier>`), tests back depuis `backend/` (`npx jest <fichier>`). Commits sur la branche courante. ⚠️ Mocks RTL à identité stable (cf. note AdminLayout dans CLAUDE.md).

---

### Task 1: `lib/host.ts` — extraire `clubSlugFromHost` (partagé proxy + manifest)

**Files:**
- Create: `frontend/lib/host.ts`
- Create: `frontend/__tests__/host.test.ts`
- Modify: `frontend/proxy.ts` (lignes 6–16 : suppression de la fonction locale + import)

- [ ] **Step 1: Write the failing test**

```typescript
// frontend/__tests__/host.test.ts
import { clubSlugFromHost } from '../lib/host';

describe('clubSlugFromHost', () => {
  it.each([
    ['localhost:3000', 'localhost', null],
    ['palova.fr', 'palova.fr', null],
    ['www.palova.fr', 'palova.fr', null],
    ['app.palova.fr', 'palova.fr', null],
    ['demo.palova.fr', 'palova.fr', 'demo'],
    ['demo.palova.fr:443', 'palova.fr', 'demo'],
    ['www.demo.palova.fr', 'palova.fr', 'www'], // 1er label seulement — comportement actuel du proxy conservé
    ['autresite.com', 'palova.fr', null],
    ['', 'palova.fr', null],
  ])('host %s (root %s) → %s', (host, root, expected) => {
    expect(clubSlugFromHost(host, root)).toBe(expected);
  });

  it('demo.localhost:3000 → demo (dev local)', () => {
    expect(clubSlugFromHost('demo.localhost:3000', 'localhost')).toBe('demo');
  });
});
```

> Note : le cas `www.demo.palova.fr` documente le comportement actuel (`split('.')[0]` sur le label) — si le 1er label est `www`/`app` le proxy renvoie null, sinon il renvoie ce label. Le test ci-dessus suit **exactement** la logique copiée de `proxy.ts:7-16`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/host.test.ts` (dans `frontend/`)
Expected: FAIL — `Cannot find module '../lib/host'`

- [ ] **Step 3: Write minimal implementation**

```typescript
// frontend/lib/host.ts
// Résolution du slug club depuis l'hôte HTTP (multi-hôte : plateforme vs sous-domaine club).
// Fonction pure partagée par proxy.ts (middleware) et app/manifest.ts (manifest PWA).
export function clubSlugFromHost(host: string, root: string): string | null {
  const h = host.split(':')[0];
  if (h === root || h === `www.${root}` || h === `app.${root}`) return null;
  if (h.endsWith(`.${root}`)) {
    const label = h.slice(0, -(root.length + 1)).split('.')[0];
    if (!label || label === 'www' || label === 'app') return null;
    return label;
  }
  return null; // hôte inconnu → traité comme plateforme
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest __tests__/host.test.ts`
Expected: PASS (10 tests)

- [ ] **Step 5: Brancher proxy.ts sur la fonction extraite**

Dans `frontend/proxy.ts` : supprimer la fonction locale `clubSlugFromHost` (lignes 6–16) et remplacer par un import. L'appel ligne 44 devient `clubSlugFromHost(host, ROOT)`.

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { isPublicPath } from './lib/authGate';
import { clubSlugFromHost } from './lib/host';

const ROOT = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'localhost';
```

et plus bas (inchangé sauf l'argument) :

```typescript
  const slug = clubSlugFromHost(host, ROOT);
```

- [ ] **Step 6: Vérifier la non-régression**

Run: `npx tsc --noEmit` puis `npx jest` (dans `frontend/`)
Expected: tsc silencieux, toutes les suites passent

- [ ] **Step 7: Commit**

```bash
git add frontend/lib/host.ts frontend/__tests__/host.test.ts frontend/proxy.ts
git commit -m "refactor(front): extrait clubSlugFromHost vers lib/host (partage proxy/manifest)"
```

---

### Task 2: Icônes Palova statiques (script de génération + PNG committés)

**Files:**
- Create: `backend/scripts/generate-pwa-icons.ts`
- Create (générés) : `frontend/public/icon-192.png`, `icon-512.png`, `icon-maskable-192.png`, `icon-maskable-512.png`, `apple-touch-icon.png`
- Create (générés) : `backend/assets/pwa/icon-192.png`, `icon-512.png`, `icon-maskable-192.png`, `icon-maskable-512.png`, `icon-apple-180.png`

Pas de TDD ici (outillage one-shot produisant des assets committés) ; le script vérifie lui-même les dimensions produites.

- [ ] **Step 1: Installer sharp (dépendance de prod backend — servira aussi à l'endpoint icône)**

Run (dans `backend/`): `npm install sharp`
Expected: ajout dans `package.json` dependencies, install sans erreur (binaires précompilés sur Windows et bookworm)

- [ ] **Step 2: Écrire le script**

```typescript
// backend/scripts/generate-pwa-icons.ts
// Génère les PNG PWA Palova depuis les SVG de marque du frontend :
// - frontend/public : icônes du manifest plateforme (any + maskable) + apple-touch-icon
// - backend/assets/pwa : icônes de repli de l'endpoint GET /api/clubs/:slug/icon/*
// Usage : npx ts-node scripts/generate-pwa-icons.ts  (depuis backend/)
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const FRONT_PUBLIC = path.join(__dirname, '..', '..', 'frontend', 'public');
const BACK_ASSETS = path.join(__dirname, '..', 'assets', 'pwa');
const BRAND_BG = '#5e93da'; // fond de palova-icon-blue.svg

// Icône « any » : le SVG complet (carré arrondi bleu + balle blanche), coins transparents.
function renderRounded(size: number): Promise<Buffer> {
  const svg = fs.readFileSync(path.join(FRONT_PUBLIC, 'palova-icon-blue.svg'));
  return sharp(svg, { density: 300 }).resize(size, size).png().toBuffer();
}

// Plein cadre (maskable Android / apple-touch iOS, qui appliquent leur propre masque) :
// fond plein + pictogramme blanc centré, réduit pour rester dans la zone de sécurité.
async function renderFullBleed(size: number, markRatio: number): Promise<Buffer> {
  const markSvg = fs.readFileSync(path.join(FRONT_PUBLIC, 'palova-mark-white.svg'));
  const markSize = Math.round(size * markRatio);
  const mark = await sharp(markSvg, { density: 300 }).resize(markSize, markSize).png().toBuffer();
  return sharp({ create: { width: size, height: size, channels: 4, background: BRAND_BG } })
    .composite([{ input: mark, gravity: 'centre' }])
    .png().toBuffer();
}

async function main() {
  fs.mkdirSync(BACK_ASSETS, { recursive: true });
  const out: Array<[string, Buffer]> = [
    [path.join(FRONT_PUBLIC, 'icon-192.png'), await renderRounded(192)],
    [path.join(FRONT_PUBLIC, 'icon-512.png'), await renderRounded(512)],
    [path.join(FRONT_PUBLIC, 'icon-maskable-192.png'), await renderFullBleed(192, 0.62)],
    [path.join(FRONT_PUBLIC, 'icon-maskable-512.png'), await renderFullBleed(512, 0.62)],
    [path.join(FRONT_PUBLIC, 'apple-touch-icon.png'), await renderFullBleed(180, 0.7)],
    [path.join(BACK_ASSETS, 'icon-192.png'), await renderRounded(192)],
    [path.join(BACK_ASSETS, 'icon-512.png'), await renderRounded(512)],
    [path.join(BACK_ASSETS, 'icon-maskable-192.png'), await renderFullBleed(192, 0.62)],
    [path.join(BACK_ASSETS, 'icon-maskable-512.png'), await renderFullBleed(512, 0.62)],
    [path.join(BACK_ASSETS, 'icon-apple-180.png'), await renderFullBleed(180, 0.7)],
  ];
  for (const [file, buf] of out) {
    fs.writeFileSync(file, buf);
    const meta = await sharp(buf).metadata();
    const expected = parseInt(file.match(/(\d+)\.png$/)?.[1] ?? (file.includes('apple-touch') ? '180' : '0'), 10);
    if (meta.width !== expected || meta.height !== expected) throw new Error(`Taille inattendue pour ${file}: ${meta.width}x${meta.height}`);
    console.log(`OK ${file} — ${meta.width}x${meta.height}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 3: Exécuter et vérifier**

Run (dans `backend/`): `npx ts-node scripts/generate-pwa-icons.ts`
Expected: 10 lignes `OK <fichier> — NxN` (192/512/192/512/180 × 2), aucune erreur de taille

- [ ] **Step 4: Vérifier que `assets/` part bien dans l'image Docker**

Lire `backend/.dockerignore` : il ne doit PAS exclure `assets/`. S'il ne mentionne pas `assets`, rien à faire.

- [ ] **Step 5: Commit**

```bash
git add backend/scripts/generate-pwa-icons.ts backend/package.json backend/package-lock.json backend/assets frontend/public/icon-192.png frontend/public/icon-512.png frontend/public/icon-maskable-192.png frontend/public/icon-maskable-512.png frontend/public/apple-touch-icon.png
git commit -m "feat(pwa): icones Palova PNG (any/maskable/apple) + script de generation"
```

---

### Task 3: `lib/manifest.ts` — construction pure du manifest

**Files:**
- Create: `frontend/lib/manifest.ts`
- Create: `frontend/__tests__/manifest.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// frontend/__tests__/manifest.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/manifest.test.ts`
Expected: FAIL — `Cannot find module '../lib/manifest'`

- [ ] **Step 3: Write minimal implementation**

```typescript
// frontend/lib/manifest.ts
// Construction pure du manifest PWA (consommée par app/manifest.ts, testable sans Next).
// Hôte plateforme (club null) → identité Palova ; hôte club → nom/couleur/icônes du club.
const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export interface ManifestClub {
  slug: string;
  name: string;
  accentColor: string;
  logoUrl: string | null;
}

export interface ManifestIcon { src: string; sizes: string; type: string; purpose?: 'maskable' }
export interface WebManifest {
  name: string; short_name: string; description: string; start_url: string;
  display: 'standalone'; background_color: string; theme_color: string; icons: ManifestIcon[];
}

const PALOVA_ICONS: ManifestIcon[] = [
  { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
  { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
  { src: '/icon-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
  { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
];

// Icônes générées par le backend depuis le logo du club (fallback Palova géré côté backend).
function clubIcons(slug: string): ManifestIcon[] {
  const base = `${API}/api/clubs/${slug}/icon`;
  return [
    { src: `${base}/192.png`, sizes: '192x192', type: 'image/png' },
    { src: `${base}/512.png`, sizes: '512x512', type: 'image/png' },
    { src: `${base}/maskable-192.png`, sizes: '192x192', type: 'image/png', purpose: 'maskable' },
    { src: `${base}/maskable-512.png`, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ];
}

// short_name : affiché sous l'icône installée — 12 caractères max.
export function shortName(name: string): string {
  const n = name.trim();
  return n.length <= 12 ? n : `${n.slice(0, 11).trimEnd()}…`;
}

export function buildManifest(club: ManifestClub | null): WebManifest {
  if (!club) {
    return {
      name: 'Palova', short_name: 'Palova',
      description: 'Réservez vos terrains de padel',
      start_url: '/', display: 'standalone',
      background_color: '#ffffff', theme_color: '#5e93da',
      icons: PALOVA_ICONS,
    };
  }
  return {
    name: club.name, short_name: shortName(club.name),
    description: `Réservations et vie du club ${club.name}`,
    start_url: '/', display: 'standalone',
    background_color: '#ffffff', theme_color: club.accentColor,
    icons: club.logoUrl ? clubIcons(club.slug) : PALOVA_ICONS,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest __tests__/manifest.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add frontend/lib/manifest.ts frontend/__tests__/manifest.test.ts
git commit -m "feat(pwa): buildManifest pur (identite Palova ou club)"
```

---

### Task 4: `app/manifest.ts` dynamique + nettoyage de l'ancien manifest + apple-touch-icon par club

**Files:**
- Create: `frontend/app/manifest.ts`
- Delete: `frontend/public/manifest.json`
- Modify: `frontend/app/layout.tsx` (metadata → `generateMetadata`)
- Modify: `frontend/proxy.ts:76` (matcher : retirer `manifest.json|` devenu inutile)

Pas de test Jest direct sur `app/manifest.ts` (route Next) — la logique est dans `lib/manifest.ts` (Task 3) ; vérification manuelle au Step 4.

- [ ] **Step 1: Créer la route manifest**

```typescript
// frontend/app/manifest.ts
import type { MetadataRoute } from 'next';
import { headers } from 'next/headers';
import { api } from '@/lib/api';
import { clubSlugFromHost } from '@/lib/host';
import { buildManifest } from '@/lib/manifest';

// Manifest PWA par hôte : identité du club sur son sous-domaine, Palova ailleurs.
// L'usage de headers() rend cette route dynamique (résolue à chaque requête —
// le proxy ne passe pas ici, motif `.*\..*` exclu, d'où la résolution par Host).
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const host = (await headers()).get('host') || '';
  const slug = clubSlugFromHost(host, process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'localhost');
  if (slug) {
    try {
      const club = await api.getClub(slug);
      return buildManifest({ slug, name: club.name, accentColor: club.accentColor, logoUrl: club.logoUrl }) as MetadataRoute.Manifest;
    } catch { /* club introuvable/suspendu → manifest Palova */ }
  }
  return buildManifest(null) as MetadataRoute.Manifest;
}
```

- [ ] **Step 2: Basculer layout.tsx sur generateMetadata (apple-touch-icon par club)**

Dans `frontend/app/layout.tsx`, remplacer le bloc `export const metadata: Metadata = {…}` (lignes 28–36) par :

```typescript
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

// L'apple-touch-icon est par club sur un hôte club (iOS ne lit pas le manifest pour
// l'icône d'accueil et ne supporte pas le SVG) ; le backend gère le repli Palova.
// Le <link rel="manifest"> est injecté automatiquement par Next (app/manifest.ts).
export async function generateMetadata(): Promise<Metadata> {
  const slug = (await headers()).get('x-club-slug');
  return {
    title: 'Palova',
    description: 'Réservez votre terrain de padel en quelques secondes',
    icons: {
      icon: '/favicon.svg',
      apple: slug ? `${API_URL}/api/clubs/${slug}/icon/apple-180.png` : '/apple-touch-icon.png',
    },
  };
}
```

(`headers` est déjà importé ligne 2 ; `Metadata` reste importé en type.)

- [ ] **Step 3: Supprimer l'ancien manifest + nettoyer le matcher**

```bash
git rm frontend/public/manifest.json
```

Dans `frontend/proxy.ts:76`, le matcher devient (suppression de `manifest.json|`, couvert par `.*\..*`) :

```typescript
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)'],
```

- [ ] **Step 4: Vérifier (tsc + manifest servi en dev)**

Run: `npx tsc --noEmit` (dans `frontend/`)
Expected: silencieux

Puis, backend lancé (`npm run dev` dans `backend/`) et frontend lancé (`npm run dev` dans `frontend/`) :

```bash
curl -s http://localhost:3000/manifest.webmanifest | head -c 400
curl -s -H "Host: demo.localhost:3000" http://localhost:3000/manifest.webmanifest | head -c 400
```

Expected: 1er appel → `"name":"Palova"` et icônes `/icon-192.png` ; 2e appel → nom du club seedé (« Padel Arena Paris ») et `theme_color` = accentColor du club. (Si les serveurs dev ne tournent pas, reporter cette vérification à la fin — étape « verify » globale.)

- [ ] **Step 5: Run full frontend tests**

Run: `npx jest`
Expected: toutes les suites passent

- [ ] **Step 6: Commit**

```bash
git add frontend/app/manifest.ts frontend/app/layout.tsx frontend/proxy.ts
git rm --cached frontend/public/manifest.json 2>/dev/null; git add -u frontend/public
git commit -m "feat(pwa): manifest dynamique par hote + apple-touch-icon par club"
```

---

### Task 5: Backend — endpoint icône club (sharp + cache disque + fallback Palova)

**Files:**
- Create: `backend/src/services/icon.service.ts`
- Create: `backend/src/routes/__tests__/icon.routes.test.ts`
- Modify: `backend/src/utils/uploads.ts` (ajout `ICONS_DIR`)
- Modify: `backend/src/routes/clubs.ts` (nouvelle route, à insérer juste avant le bloc `// Détail public d'un club par slug.`)

- [ ] **Step 1: Write the failing test**

```typescript
// backend/src/routes/__tests__/icon.routes.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run (dans `backend/`): `npx jest src/routes/__tests__/icon.routes.test.ts`
Expected: FAIL — 404 sur toutes les requêtes (route inexistante) et `ICONS_DIR` absent de utils/uploads (erreur d'import) — c'est l'échec attendu

- [ ] **Step 3: Ajouter ICONS_DIR à uploads.ts**

```typescript
// backend/src/utils/uploads.ts — remplacer les lignes 7–11 par :
export const AVATARS_DIR = path.join(UPLOADS_DIR, 'avatars');
export const ICONS_DIR = path.join(UPLOADS_DIR, 'icons'); // cache des icônes PWA de clubs

export function ensureUploadDirs(): void {
  fs.mkdirSync(AVATARS_DIR, { recursive: true });
  fs.mkdirSync(ICONS_DIR, { recursive: true });
}
```

- [ ] **Step 4: Écrire le service**

```typescript
// backend/src/services/icon.service.ts
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { prisma } from '../db/prisma';
import { ICONS_DIR } from '../utils/uploads';

// Icônes PWA d'un club : logo recadré « contain » en carré sur fond accentColor
// (jamais tronqué), cache disque uploads/icons (hash de l'URL du logo = invalidation
// naturelle au changement de logo), repli silencieux sur les PNG Palova embarqués.

interface IconVariant { size: number; markRatio: number } // markRatio < 1 : zone de sécurité (maskable)
export const ICON_VARIANTS: Record<string, IconVariant> = {
  '192': { size: 192, markRatio: 0.86 },
  '512': { size: 512, markRatio: 0.86 },
  'maskable-192': { size: 192, markRatio: 0.62 },
  'maskable-512': { size: 512, markRatio: 0.62 },
  'apple-180': { size: 180, markRatio: 0.74 },
};

const FALLBACK_DIR = path.join(process.cwd(), 'assets', 'pwa');
export function fallbackIconPath(variant: string): string {
  return path.join(FALLBACK_DIR, `icon-${variant}.png`);
}

export function iconCacheFile(clubId: string, variant: string, logoUrl: string): string {
  const hash = crypto.createHash('md5').update(logoUrl).digest('hex').slice(0, 12);
  return path.join(ICONS_DIR, `${clubId}-${variant}-${hash}.png`);
}

const FETCH_TIMEOUT_MS = 5000;
const MAX_LOGO_BYTES = 5 * 1024 * 1024; // garde poids/SSRF : 5 Mo max

async function fetchLogo(url: string): Promise<Buffer> {
  const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), redirect: 'follow' });
  if (!res.ok) throw new Error(`LOGO_HTTP_${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.byteLength > MAX_LOGO_BYTES) throw new Error('LOGO_TOO_LARGE');
  return buf;
}

async function renderIcon(logo: Buffer, accentColor: string, v: IconVariant): Promise<Buffer> {
  const inner = Math.round(v.size * v.markRatio);
  const resized = await sharp(logo)
    .resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png().toBuffer();
  return sharp({ create: { width: v.size, height: v.size, channels: 4, background: accentColor } })
    .composite([{ input: resized, gravity: 'centre' }])
    .png().toBuffer();
}

export class IconService {
  /** Chemin absolu du PNG à servir pour ce club+variant, ou null (404). */
  async getClubIconPath(slug: string, variant: string): Promise<string | null> {
    if (!ICON_VARIANTS[variant]) return null;
    const club = await prisma.club.findUnique({ where: { slug }, select: { id: true, logoUrl: true, accentColor: true } });
    if (!club) return null;
    if (!club.logoUrl) return fallbackIconPath(variant);
    const cached = iconCacheFile(club.id, variant, club.logoUrl);
    if (fs.existsSync(cached)) return cached;
    try {
      const logo = await fetchLogo(club.logoUrl);
      const png = await renderIcon(logo, club.accentColor, ICON_VARIANTS[variant]);
      fs.writeFileSync(cached, png);
      return cached;
    } catch {
      return fallbackIconPath(variant); // logo injoignable/illisible → icône Palova
    }
  }
}

export const iconService = new IconService();
```

- [ ] **Step 5: Ajouter la route dans clubs.ts**

Dans `backend/src/routes/clubs.ts`, ajouter l'import en tête (à côté des autres services) :

```typescript
import { iconService } from '../services/icon.service';
```

puis insérer **juste avant** le bloc `// Détail public d'un club par slug.` (ligne ~141) :

```typescript
// Icône PWA du club (référencée par le manifest) — public, PNG, repli Palova.
router.get('/:slug/icon/:file', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const m = asString(req.params.file).match(/^([a-z0-9-]+)\.png$/);
    const filePath = m ? await iconService.getClubIconPath(asString(req.params.slug), m[1]) : null;
    if (!filePath) { res.status(404).json({ error: 'Icône introuvable' }); return; }
    res.sendFile(filePath, { headers: { 'Cache-Control': 'public, max-age=86400' } });
  } catch (err) { handleError(err, res, next); }
});
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx jest src/routes/__tests__/icon.routes.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 7: Run full backend tests + tsc**

Run: `npx tsc --noEmit` puis `npx jest` (dans `backend/`)
Expected: tout passe

- [ ] **Step 8: Commit**

```bash
git add backend/src/services/icon.service.ts backend/src/routes/clubs.ts backend/src/utils/uploads.ts backend/src/routes/__tests__/icon.routes.test.ts
git commit -m "feat(pwa): endpoint icone PWA par club (sharp, cache disque, repli Palova)"
```

---

### Task 6: `lib/install.ts` + hook `useInstallPrompt`

**Files:**
- Create: `frontend/lib/install.ts`
- Create: `frontend/lib/useInstallPrompt.ts`
- Create: `frontend/__tests__/install.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// frontend/__tests__/install.test.ts
import { installState, isIosUa } from '../lib/install';

const UA_IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const UA_IPAD_DESKTOP = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15';
const UA_CHROME_ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36';

describe('isIosUa', () => {
  it('détecte un iPhone', () => expect(isIosUa(UA_IPHONE)).toBe(true));
  it('détecte un iPad récent (UA Macintosh) via le tactile', () => expect(isIosUa(UA_IPAD_DESKTOP, true)).toBe(true));
  it('un vrai Mac (sans tactile) n est pas iOS', () => expect(isIosUa(UA_IPAD_DESKTOP, false)).toBe(false));
  it('Android n est pas iOS', () => expect(isIosUa(UA_CHROME_ANDROID)).toBe(false));
});

describe('installState', () => {
  it('déjà installée (standalone) → hidden, même si prompt dispo', () =>
    expect(installState({ standalone: true, canPrompt: true, ios: false })).toBe('hidden'));
  it('prompt natif capturé → native', () =>
    expect(installState({ standalone: false, canPrompt: true, ios: false })).toBe('native'));
  it('iOS sans prompt → ios-manual', () =>
    expect(installState({ standalone: false, canPrompt: false, ios: true })).toBe('ios-manual'));
  it('navigateur sans installation → hidden', () =>
    expect(installState({ standalone: false, canPrompt: false, ios: false })).toBe('hidden'));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/install.test.ts`
Expected: FAIL — `Cannot find module '../lib/install'`

- [ ] **Step 3: Write minimal implementation**

```typescript
// frontend/lib/install.ts
// Éligibilité à l'installation PWA — logique pure (testable sans navigateur).
export type InstallState = 'native' | 'ios-manual' | 'hidden';

// iOS = iPhone/iPad/iPod. Les iPads récents se présentent comme « Macintosh » :
// on les reconnaît par l'écran tactile (hasTouch, fourni par l'appelant).
export function isIosUa(ua: string, hasTouch = false): boolean {
  if (/iPhone|iPad|iPod/i.test(ua)) return true;
  return /Macintosh/i.test(ua) && hasTouch;
}

export function installState(opts: { standalone: boolean; canPrompt: boolean; ios: boolean }): InstallState {
  if (opts.standalone) return 'hidden'; // déjà installée
  if (opts.canPrompt) return 'native';  // Chrome/Edge : prompt natif capturé
  if (opts.ios) return 'ios-manual';    // iOS : pas de prompt → tutoriel
  return 'hidden';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest __tests__/install.test.ts`
Expected: PASS (8 tests)

- [ ] **Step 5: Écrire le hook (pas de test dédié — testé via ProfileMenu en Task 7, la logique est dans install.ts)**

```typescript
// frontend/lib/useInstallPrompt.ts
'use client';
import { useEffect, useState } from 'react';
import { InstallState, installState, isIosUa } from '@/lib/install';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

// Capture beforeinstallprompt (Chrome/Edge), détecte iOS et le mode standalone,
// expose l'état d'éligibilité + le déclencheur du prompt natif.
export function useInstallPrompt(): { state: InstallState; promptInstall: () => void } {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [env, setEnv] = useState({ standalone: false, ios: false, installed: false });

  useEffect(() => {
    setEnv({
      standalone: window.matchMedia('(display-mode: standalone)').matches
        || (navigator as unknown as { standalone?: boolean }).standalone === true,
      ios: isIosUa(navigator.userAgent, navigator.maxTouchPoints > 1),
      installed: false,
    });
    const onPrompt = (e: Event) => { e.preventDefault(); setDeferred(e as BeforeInstallPromptEvent); };
    const onInstalled = () => setEnv((s) => ({ ...s, installed: true }));
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const state: InstallState = env.installed
    ? 'hidden'
    : installState({ standalone: env.standalone, canPrompt: deferred != null, ios: env.ios });
  const promptInstall = () => { deferred?.prompt(); setDeferred(null); };
  return { state, promptInstall };
}
```

> ⚠️ jsdom n'implémente pas `window.matchMedia` : le test ProfileMenu (Task 7) mocke le hook entier, pas besoin de polyfill.

- [ ] **Step 6: tsc + commit**

Run: `npx tsc --noEmit`
Expected: silencieux

```bash
git add frontend/lib/install.ts frontend/lib/useInstallPrompt.ts frontend/__tests__/install.test.ts
git commit -m "feat(pwa): etat d'eligibilite d'installation + hook beforeinstallprompt"
```

---

### Task 7: Entrée « Installer l'application » dans ProfileMenu (+ tutoriel iOS)

**Files:**
- Modify: `frontend/components/ProfileMenu.tsx`
- Modify: `frontend/__tests__/ProfileMenu.test.tsx`

- [ ] **Step 1: Write the failing tests**

Dans `frontend/__tests__/ProfileMenu.test.tsx`, ajouter après le mock de `../lib/api` (ligne ~25) :

```typescript
// État d'installation PWA contrôlable par test (objet stable — cf. note mocks CLAUDE.md).
const installCtx: { state: 'hidden' | 'native' | 'ios-manual'; promptInstall: jest.Mock } =
  { state: 'hidden', promptInstall: jest.fn() };
jest.mock('../lib/useInstallPrompt', () => ({ useInstallPrompt: () => installCtx }));
```

dans le `beforeEach` existant, ajouter :

```typescript
    installCtx.state = 'hidden';
    installCtx.promptInstall = jest.fn();
```

puis ajouter les tests en fin de `describe('ProfileMenu', …)` :

```typescript
  it("pas d'entrée Installer quand l'installation est impossible", async () => {
    document.cookie = 'token=abc; path=/';
    wrap();
    openMenu();
    await screen.findByText('Marc Bidaut');
    expect(screen.queryByText("Installer l'application")).not.toBeInTheDocument();
  });

  it('état native : le clic déclenche le prompt du navigateur', async () => {
    document.cookie = 'token=abc; path=/';
    installCtx.state = 'native';
    wrap();
    openMenu();
    fireEvent.click(await screen.findByText("Installer l'application"));
    expect(installCtx.promptInstall).toHaveBeenCalledTimes(1);
  });

  it('état ios-manual : le clic ouvre le tutoriel « Sur l\'écran d\'accueil »', async () => {
    document.cookie = 'token=abc; path=/';
    installCtx.state = 'ios-manual';
    wrap();
    openMenu();
    fireEvent.click(await screen.findByText("Installer l'application"));
    expect(installCtx.promptInstall).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: "Installer l'application" })).toBeInTheDocument();
    expect(screen.getByText(/Sur l'écran d'accueil/)).toBeInTheDocument();
    fireEvent.click(screen.getByText('Compris'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest __tests__/ProfileMenu.test.tsx`
Expected: FAIL — les 2 derniers tests ne trouvent pas « Installer l'application » (le 1er passe déjà : l'entrée n'existe pas encore — c'est attendu, il protège la régression future)

- [ ] **Step 3: Implémenter dans ProfileMenu.tsx**

Ajouter l'import :

```typescript
import { useInstallPrompt } from '@/lib/useInstallPrompt';
```

Dans le composant, après `const [packages, setPackages] = useState<MemberPackage[]>([]);` :

```typescript
  const { state: installState, promptInstall } = useInstallPrompt();
  const [iosHelp, setIosHelp] = useState(false);
```

Dans le bloc `{/* Liens */}`, juste avant la ligne `<MenuItem th={th} icon="logout" …` :

```tsx
            {installState !== 'hidden' && (
              <MenuItem th={th} icon="home" label="Installer l'application"
                onClick={() => { setOpen(false); if (installState === 'native') promptInstall(); else setIosHelp(true); }} />
            )}
```

Et juste avant le `</div>` final du composant (après le bloc `{open && (…)}`), le tutoriel iOS :

```tsx
      {iosHelp && (
        <div role="dialog" aria-label="Installer l'application" style={{
          position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(0,0,0,0.45)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
        }}>
          <div style={{ width: 340, maxWidth: '100%', background: th.surface, border: `1px solid ${th.line}`, borderRadius: 16, padding: 20, fontFamily: th.fontUI, color: th.text }}>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 10 }}>Installer l'application</div>
            <ol style={{ margin: 0, paddingLeft: 18, fontSize: 14, color: th.textMute, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <li>Ouvrez le menu <strong>Partager</strong> de Safari</li>
              <li>Choisissez <strong>« Sur l'écran d'accueil »</strong></li>
              <li>Validez avec <strong>Ajouter</strong></li>
            </ol>
            <button onClick={() => setIosHelp(false)} style={{
              marginTop: 14, width: '100%', padding: '10px 0', borderRadius: 10, border: 'none', cursor: 'pointer',
              background: th.accent, color: th.onAccent, fontFamily: th.fontUI, fontWeight: 700, fontSize: 14,
            }}>Compris</button>
          </div>
        </div>
      )}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest __tests__/ProfileMenu.test.tsx`
Expected: PASS (suite complète, anciens tests inclus)

- [ ] **Step 5: Run full frontend tests + tsc**

Run: `npx tsc --noEmit` puis `npx jest`
Expected: tout passe, sortie sans warning act()

- [ ] **Step 6: Commit**

```bash
git add frontend/components/ProfileMenu.tsx frontend/__tests__/ProfileMenu.test.tsx
git commit -m "feat(pwa): entree Installer l'application dans le menu profil (+ tutoriel iOS)"
```

---

### Task 8: Documentation + vérification finale

**Files:**
- Modify: `CLAUDE.md` (nouvelle section avant « À implémenter »)
- Modify: `docs/superpowers/specs/2026-06-12-pwa-install-design.md` (statut → implémenté)

- [ ] **Step 1: Section CLAUDE.md**

Insérer avant `## À implémenter (pas encore fait)` :

```markdown
## Installation PWA (icône web app) ✅ implémenté

L'app est installable (manifest + icônes, **sans service worker** — non requis par Chrome/Edge, next-pwa reste inactif). **Manifest dynamique par hôte** : `frontend/app/manifest.ts` (dynamique via `headers()`, résolution du slug par `clubSlugFromHost` extrait dans `lib/host.ts`, construction pure `lib/manifest.ts`) — sur un sous-domaine club : nom/`theme_color`(accentColor)/icônes du club ; plateforme ou repli : identité Palova (`public/icon-*.png` + maskable + `apple-touch-icon.png`, générés par `backend/scripts/generate-pwa-icons.ts`). **Icônes club** : `GET /api/clubs/:slug/icon/{192,512,maskable-192,maskable-512,apple-180}.png` (`icon.service.ts`, sharp) — logo « contain » sur fond accentColor, cache disque `uploads/icons/<clubId>-<variant>-<hash(logoUrl)>.png` (volume prod `backend_uploads`), garde 5 s / 5 Mo sur le téléchargement du logo, **tout échec → PNG Palova embarqué** (`backend/assets/pwa/`). L'apple-touch-icon est par club via `generateMetadata()` dans `app/layout.tsx`. **UX** : entrée « Installer l'application » dans `ProfileMenu` (hook `lib/useInstallPrompt.ts` : `beforeinstallprompt`/`appinstalled`/standalone ; états purs `lib/install.ts` : `native` → prompt, `ios-manual` → tutoriel « Sur l'écran d'accueil », `hidden` sinon). Spec : `docs/superpowers/specs/2026-06-12-pwa-install-design.md`.
```

- [ ] **Step 2: Statut de la spec**

Dans la spec, remplacer `> Statut : **validé, à implémenter** (2026-06-12).` par `> Statut : **implémenté** (2026-06-12).`

- [ ] **Step 3: Vérification finale complète**

Run: `npx jest` + `npx tsc --noEmit` dans `frontend/` ET `backend/`
Expected: 4 commandes vertes

Si les serveurs dev sont disponibles, refaire la vérification curl de Task 4 Step 4 (manifest plateforme vs club) + `curl -s -o NUL -w "%{http_code} %{content_type}" http://localhost:3001/api/clubs/club-demo/icon/192.png` → `200 image/png`.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md docs/superpowers/specs/2026-06-12-pwa-install-design.md
git commit -m "docs: installation PWA implementee (CLAUDE.md + statut spec)"
```
