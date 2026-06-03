# Palova — Instructions pour Claude

Application de réservation de terrains de padel. Backend API séparé du frontend Next.js.

## Démarrage

```bash
# 1. Démarrer PostgreSQL + Redis (Docker)
"C:\Program Files\Docker\Docker\resources\bin\docker-compose-v1.exe" up -d

# 2. Backend (dans un terminal, dossier backend/)
npm run dev
# → http://localhost:3001

# 3. Frontend (dans un autre terminal, dossier frontend/)
npm run dev
# → http://localhost:3000
```

> **IMPORTANT — Docker** : La version installée (20.10.23) n'a pas le plugin `compose`. Toujours utiliser `docker-compose-v1.exe`, jamais `docker compose`.

## Architecture

```
palova/
├── docker-compose.yml       postgres:16 (5432) + redis:7 (6379)
├── backend/                 Express 5 + Prisma 7 + ioredis, port 3001
│   ├── .env                 DATABASE_URL, REDIS_HOST, JWT_SECRET, PORT=3001
│   ├── prisma/schema.prisma Club, Court, User, Reservation
│   └── src/
│       ├── app.ts
│       ├── db/prisma.ts     ← Prisma 7 : DOIT utiliser PrismaPg adapter
│       ├── redis/client.ts
│       ├── services/        availability, reservation, sse
│       └── jobs/cleanup.job.ts
└── frontend/                Next.js 16 + React 19 + Tailwind v4, port 3000
    ├── .env.local           NEXT_PUBLIC_API_URL=http://localhost:3001
    ├── instrumentation.ts   gère les crashes EPIPE du serveur dev
    └── app/
        ├── courts/page.tsx        liste des terrains (server component)
        └── courts/[id]/page.tsx   réservation (client component)
```

## Contraintes techniques critiques

### Prisma 7 — driver adapter obligatoire
```typescript
// TOUJOURS faire ça, jamais new PrismaClient() seul
import { PrismaPg } from '@prisma/adapter-pg';
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });
```
S'applique à `src/db/prisma.ts` ET `prisma/seed.ts`.

### Next.js 16 — breaking changes
- **Turbopack** est le bundler par défaut (pas Webpack)
- **`params` dans les server pages** = Promise → toujours `await params`
- **`middleware.ts`** renommé en `proxy.ts`
- **`next lint`** supprimé — utiliser ESLint directement

### next-pwa@5.6.0 installé mais NON configuré
Incompatible avec Turbopack. Ne pas l'activer dans next.config.ts.

## Données de test (déjà seedées)

| Type  | Données |
|-------|---------|
| Club  | id=`club-demo`, "Padel Arena Paris", 12 rue du Padel Paris |
| Courts | `court-1` indoor 25€/h, `court-2` indoor 25€/h, `court-3` outdoor 20€/h |
| User  | `test@palova.fr` / `password123` |

## Logique métier clé

**Zéro double-réservation** = deux niveaux :
1. **Redis SET NX** (`lock:court:{id}:{startTime}`, TTL 10 min) — bloque dès le début du checkout
2. **PostgreSQL Serializable + SELECT FOR UPDATE** — garantie absolue à la confirmation

**SSE (temps réel)** — `SSEService` singleton broadcast aux clients connectés sur un terrain :
- `slot_held` → créneau pris (PENDING)
- `slot_confirmed` → confirmé
- `slot_released` → libéré (annulation ou expiration)

**Créneaux** : 8h–22h heure Paris (UTC+2 hardcodé), pas de 30 min.

## Bugs connus et résolus

- **EPIPE crash** dev server → géré dans `frontend/instrumentation.ts`
- **Hydration mismatch** extension ColorZilla → `suppressHydrationWarning` sur `<html>` et `<body>` dans layout.tsx
- **Page vide au clic** sur un terrain → `loading` initialisé à `true` dans courts/[id]/page.tsx
- **Slot count** : 8h–22h / 30min step / 60min durée = **27 créneaux** (pas 28)

## Commandes utiles

```bash
# Backend
npm run db:migrate   # appliquer les migrations Prisma
npm run db:seed      # remettre les données de test
npm test             # tests Jest

# Frontend
npm test             # tests React Testing Library

# Vérifier que ça tourne
curl http://localhost:3001/health
curl "http://localhost:3001/api/courts?clubId=club-demo"
```

## Tournois (v1 — inscriptions) ✅ implémenté

Catégories P25→P2000, genre Messieurs/Dames/Mixte (composition 1H+1F contrôlée via `User.sex`), inscription en binôme (les 2 joueurs membres du club avec téléphone + licence `membershipNo`), modification du coéquipier / annulation jusqu'à `registrationDeadline`, liste d'attente avec promotion auto. Backend : `TournamentService` + routes `/api/tournaments/*`, `/api/clubs/:slug/tournaments`, `/api/me/{profile,tournaments}` + `PATCH /api/me`, admin `/api/clubs/:clubId/admin/tournaments`. Frontend : `/tournois`, `/tournois/[id]`, `/admin/tournaments`, lien « Tournois » sur la page d'accueil club. Spec & plan : `docs/superpowers/specs/2026-06-03-tournois-padel-design.md` et `docs/superpowers/plans/2026-06-03-tournois-padel.md`.

## À implémenter (pas encore fait)

- Authentification réelle (JWT login/register) — actuellement `DEMO_TOKEN = 'demo-token'` hardcodé dans courts/[id]/page.tsx
- Paiement (dont règlement en ligne des frais d'inscription tournoi — `entryFee` est purement informatif en v1)
- Gestion admin du club (créneaux, tarifs)
- Timezone dynamique depuis `club.timezone` (actuellement UTC_OFFSET=2 hardcodé)
- Tournois — évolutions : tableaux/poules/scores & résultats, notifications e-mail (promotion liste d'attente, rappels), blocage automatique de terrains par un tournoi
