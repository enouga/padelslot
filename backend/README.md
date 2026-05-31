# PadelConnect — Backend API

API REST pour la réservation de terrains de padel, avec garantie **zéro double-réservation** et mises à jour **temps réel** (Server-Sent Events).

- **Stack** : Node.js · Express 5 · TypeScript · Prisma 7 (PostgreSQL) · ioredis · JWT
- **Port** : `3001`
- **Frontend associé** : Next.js 16 sur le port `3000` (dossier `../frontend`)

---

## Sommaire

- [Démarrage rapide](#démarrage-rapide)
- [Variables d'environnement](#variables-denvironnement)
- [Architecture](#architecture)
- [Modèle de données](#modèle-de-données)
- [Authentification](#authentification)
- [Endpoints API](#endpoints-api)
- [Logique métier clé](#logique-métier-clé)
- [Temps réel (SSE)](#temps-réel-sse)
- [Job de nettoyage](#job-de-nettoyage)
- [Tests](#tests)
- [Scripts npm](#scripts-npm)
- [Pièges connus](#pièges-connus)

---

## Démarrage rapide

```bash
# 1. Depuis la racine du projet : démarrer PostgreSQL + Redis
#    ⚠ Docker 20.10.23 n'a pas le plugin `compose` → utiliser docker-compose-v1.exe
"C:\Program Files\Docker\Docker\resources\bin\docker-compose-v1.exe" up -d

# 2. Dans backend/ : installer, migrer, seeder
npm install
npm run db:migrate     # applique les migrations Prisma
npm run db:seed        # données de démo (club, terrains, utilisateur)

# 3. Lancer l'API en dev (nodemon + ts-node)
npm run dev
# → Backend démarré sur http://localhost:3001
```

Vérifier que tout répond :

```bash
curl http://localhost:3001/health
# {"status":"ok"}

curl "http://localhost:3001/api/courts?clubId=club-demo"
```

---

## Variables d'environnement

À placer dans `backend/.env` :

| Variable       | Exemple                                                            | Rôle |
|----------------|-------------------------------------------------------------------|------|
| `DATABASE_URL` | `postgresql://padeluser:padelpass@localhost:5432/padelconnect`    | Connexion PostgreSQL (utilisée par l'adapter Prisma `PrismaPg`) |
| `REDIS_HOST`   | `localhost`                                                       | Hôte Redis (défaut `localhost`) |
| `REDIS_PORT`   | `6379`                                                            | Port Redis (défaut `6379`) |
| `JWT_SECRET`   | `une-chaîne-secrète-longue`                                       | Clé de signature des tokens JWT (**obligatoire**) |
| `PORT`         | `3001`                                                            | Port d'écoute de l'API (défaut `3001`) |
| `FRONTEND_URL` | `http://localhost:3000`                                           | Origine autorisée par CORS (défaut `http://localhost:3000`) |
| `NODE_ENV`     | `development`                                                     | Active les logs Prisma `error`/`warn` en dev |

---

## Architecture

```
backend/
├── prisma/
│   ├── schema.prisma          Club, Court, User, Reservation (+ enums Role, ReservationStatus)
│   └── seed.ts                Données de démo (utilise l'adapter PrismaPg)
├── prisma.config.ts
├── jest.config.ts
└── src/
    ├── app.ts                 Point d'entrée Express : monte les routers, /health, gestion d'erreurs
    ├── db/prisma.ts           Client Prisma 7 (adapter PrismaPg, singleton global)
    ├── redis/client.ts        Client ioredis (lazyConnect)
    ├── middleware/
    │   ├── auth.ts            authMiddleware : vérifie le JWT → req.user
    │   └── requireClubAdmin.ts requireClubAdmin : exige role CLUB_ADMIN + clubId
    ├── routes/
    │   ├── auth.ts           POST /api/auth/login
    │   ├── courts.ts         GET /api/courts, disponibilités, flux SSE
    │   ├── reservations.ts   hold / confirm / cancel (client)
    │   └── admin.ts          gestion terrains + réservations (CLUB_ADMIN)
    ├── services/
    │   ├── availability.service.ts  Calcul des créneaux disponibles
    │   ├── reservation.service.ts   Hold/confirm/cancel + anti double-booking
    │   ├── court.service.ts         CRUD terrains côté admin
    │   └── sse.service.ts           Singleton de diffusion SSE
    └── jobs/
        └── cleanup.job.ts     Cron : annule les PENDING expirés
```

Ordre de montage des routers (dans `app.ts`) :

```
/api/auth          → authRouter
/api/admin         → adminRouter
/api/courts        → courtsRouter
/api/reservations  → reservationsRouter
/health            → { status: 'ok' }
```

---

## Modèle de données

```
Club ──< Court ──< Reservation >── User
                                    │
Club ──────────────────────────────┘ (un User peut être rattaché à un Club)
```

- **Club** : `id`, `name`, `address`, `timezone` (défaut `Europe/Paris`)
- **Court** : `name`, `surface` (`indoor`/`outdoor`), `isActive`, `pricePerHour` (Decimal), `openHour`/`closeHour` (heures locales club, défaut 8 → 22)
- **User** : `email` (unique), `password` (hash bcrypt), `firstName`, `lastName`, `phone?`, `role` (`CLIENT` | `CLUB_ADMIN`), `clubId?`
- **Reservation** : `courtId`, `userId`, `startTime`/`endTime` (**TIMESTAMPTZ**), `status` (`PENDING` | `CONFIRMED` | `CANCELLED`), `totalPrice`, `notes?`, `cancelledAt?`

> Les colonnes temporelles utilisent `@db.Timestamptz` (timezone-aware) — indispensable pour des calculs de créneaux corrects.

---

## Authentification

JWT « Bearer token », valide **7 jours**, signé avec `JWT_SECRET`.

**Payload du token** : `{ id, email, role, clubId }`.

Le middleware `authMiddleware` extrait le token de l'en-tête `Authorization: Bearer <token>`, le vérifie, et pose `req.user`. Les tokens anciens sans `role`/`clubId` sont rétro-compatibles (`role` → `CLIENT`, `clubId` → `null`).

Le middleware `requireClubAdmin` (appliqué après `authMiddleware`) refuse l'accès (`403 FORBIDDEN`) si l'utilisateur n'est pas `CLUB_ADMIN` avec un `clubId`. Toutes les routes `/api/admin/*` en dépendent.

**Utilisateur de démo (après seed)** :

| Email                    | Mot de passe  | Rôle         | Club        |
|--------------------------|---------------|--------------|-------------|
| `test@padelconnect.fr`   | `password123` | `CLUB_ADMIN` | `club-demo` |

Exemple de login :

```bash
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@padelconnect.fr","password":"password123"}'
# → { "token": "...", "user": { ... } }
```

---

## Endpoints API

### Public

| Méthode | Route | Description |
|--------:|-------|-------------|
| `GET`  | `/health` | Sonde de vie → `{ "status": "ok" }` |
| `POST` | `/api/auth/login` | Login. Body `{ email, password }` → `{ token, user }`. `400` si champ manquant, `401` si identifiants invalides |
| `GET`  | `/api/courts?clubId=...` | Terrains **actifs** d'un club (triés par nom). `400` si `clubId` manquant |
| `GET`  | `/api/courts/:id/availability?date=YYYY-MM-DD&duration=60\|90\|120` | Créneaux du jour avec `available: boolean`. `400` si `date`/`duration` invalides |
| `GET`  | `/api/courts/:id/stream` | Flux **SSE** des évènements du terrain (voir [Temps réel](#temps-réel-sse)) |

### Réservations — client (auth requise)

En-tête `Authorization: Bearer <token>` obligatoire.

| Méthode | Route | Description |
|--------:|-------|-------------|
| `POST`   | `/api/reservations/hold` | Pré-réserve un créneau (hold 10 min). Body `{ courtId, startTime, endTime }` → `201` + réservation `PENDING`. `409 SLOT_ALREADY_HELD` / `SLOT_NOT_AVAILABLE` |
| `POST`   | `/api/reservations/:id/confirm` | Confirme un hold (→ `CONFIRMED`). `404` introuvable, `403 UNAUTHORIZED` (pas le propriétaire), `409 RESERVATION_NOT_PENDING` / `SLOT_NO_LONGER_AVAILABLE` |
| `DELETE` | `/api/reservations/:id` | Annule sa propre réservation. `404`, `403 UNAUTHORIZED`, `409 ALREADY_CANCELLED` |

### Administration club (`CLUB_ADMIN` requis)

Toutes sous `/api/admin/*` — `authMiddleware` + `requireClubAdmin`. Périmètre limité au `clubId` de l'admin.

| Méthode | Route | Description |
|--------:|-------|-------------|
| `GET`   | `/api/admin/courts` | Tous les terrains du club (y compris désactivés) |
| `POST`  | `/api/admin/courts` | Crée un terrain. Body `{ name, surface?, pricePerHour, openHour?, closeHour? }` → `201`. `400 VALIDATION_ERROR` |
| `PATCH` | `/api/admin/courts/:id` | Modifie un terrain. `404 COURT_NOT_FOUND` (ou autre club), `400 VALIDATION_ERROR` |
| `PATCH` | `/api/admin/courts/:id/active` | Active/désactive. Body `{ isActive: boolean }`. `400` si non booléen |
| `GET`   | `/api/admin/reservations?date=&courtId=&status=` | Planning du club + résumé `{ total, paidTotal }`. Filtres optionnels |
| `DELETE`| `/api/admin/reservations/:id` | Annule n'importe quelle résa **de son club**. `404`, `403 CLUB_MISMATCH`, `409 ALREADY_CANCELLED` |

**Codes d'erreur applicatifs** (renvoyés en `{ "error": "<CODE>" }`) :
`SLOT_ALREADY_HELD`, `SLOT_NOT_AVAILABLE`, `RESERVATION_NOT_FOUND`, `RESERVATION_NOT_PENDING`, `SLOT_NO_LONGER_AVAILABLE`, `UNAUTHORIZED`, `ALREADY_CANCELLED`, `FORBIDDEN`, `COURT_NOT_FOUND`, `VALIDATION_ERROR`, `CLUB_MISMATCH`.

---

## Logique métier clé

### Zéro double-réservation (deux verrous)

1. **Verrou Redis (optimiste, court terme)** — au `hold`, un `SET NX EX 600` sur la clé `lock:court:{courtId}:{startTime ISO}` réserve le créneau pendant 10 min. Si la clé existe déjà → `SLOT_ALREADY_HELD`.
2. **Verrou PostgreSQL (garantie absolue)** — à la confirmation, transaction **Serializable** avec `SELECT ... FOR UPDATE` sur la ligne, puis vérification des conflits `CONFIRMED` chevauchants. L'isolation Serializable protège contre les insertions fantômes concurrentes.

> ⚠ Le `COUNT(*)` de conflits dans `confirmReservation` n'utilise **pas** `FOR UPDATE` : PostgreSQL l'interdit sur un agrégat. C'est volontaire — la protection vient de l'isolation Serializable.

Un créneau est considéré « pris » s'il existe une réservation `CONFIRMED`, **ou** `PENDING` créée il y a moins de 10 minutes, qui chevauche `[startTime, endTime[`.

### Calcul des disponibilités

`AvailabilityService.getAvailableSlots(courtId, date, durationMinutes)` :
- pas de **30 min**, durées autorisées **60 / 90 / 120 min** ;
- bornes `openHour`/`closeHour` du terrain, converties UTC via un offset **hardcodé `UTC_OFFSET = 2`** (heure d'été Paris) ;
- un créneau est `available: false` s'il chevauche une résa active (`CONFIRMED` ou `PENDING` < 10 min).

> Exemple : 8h–22h, pas 30 min, durée 60 min → **27 créneaux** (le dernier démarre à 21h00).

### Tarification

`totalPrice = pricePerHour × durée(h)`, calculé en `Prisma.Decimal` au moment du hold.

---

## Temps réel (SSE)

`SSEService` est un **singleton** (`getInstance()`) qui maintient les connexions par terrain et diffuse les évènements via `/api/courts/:id/stream`.

| Évènement        | Quand |
|------------------|-------|
| `slot_held`      | Un créneau passe en `PENDING` (hold) — inclut `expiresAt` |
| `slot_confirmed` | Un créneau est confirmé (`CONFIRMED`) |
| `slot_released`  | Un créneau est libéré (annulation client/admin ou expiration du hold) |

Chaque payload contient `type`, `courtId`, `reservationId`, `startTime`, `endTime`.

---

## Job de nettoyage

`startCleanupJob()` (lancé au démarrage du serveur) tourne **toutes les minutes** (node-cron) et annule les réservations `PENDING` dont le hold de 10 min a expiré, en émettant `slot_released`. Évite les créneaux bloqués par des holds abandonnés.

---

## Tests

Jest + ts-jest. Prisma et Redis sont mockés (`src/__mocks__/`).

```bash
npm test                # tous les tests
npm run test:coverage   # avec couverture
```

Tests présents : `availability.service`, `reservation.service`, `court.service`.

> Note : les tests mockent Prisma, donc le **vrai SQL n'est jamais exécuté** — certains bugs (ex. `FOR UPDATE` sur agrégat) ne se révèlent qu'à l'exécution réelle.

---

## Scripts npm

| Script | Commande | Rôle |
|--------|----------|------|
| `npm run dev` | `nodemon --exec ts-node src/app.ts` | Serveur de dev avec rechargement |
| `npm run build` | `tsc` | Compile vers `dist/` |
| `npm start` | `node dist/app.js` | Lance la version compilée |
| `npm test` | `jest` | Tests |
| `npm run test:coverage` | `jest --coverage` | Tests + couverture |
| `npm run db:migrate` | `prisma migrate dev` | Migrations Prisma |
| `npm run db:seed` | `ts-node prisma/seed.ts` | Données de démo |

---

## Pièges connus

- **Prisma 7 exige un driver adapter.** `new PrismaClient()` seul lève `PrismaClientInitializationError`. Toujours passer par `PrismaPg` (`@prisma/adapter-pg`) — appliqué dans `src/db/prisma.ts` **et** `prisma/seed.ts`.
- **Docker** : la version 20.10.23 n'a pas `docker compose`. Utiliser le chemin complet vers `docker-compose-v1.exe`.
- **TIMESTAMPTZ** : les migrations doivent générer `TIMESTAMPTZ` (pas `TIMESTAMP(3)`) pour les colonnes temporelles.
- **`FOR UPDATE` sur agrégat** interdit en PostgreSQL — ne pas le remettre sur le `COUNT(*)` de `confirmReservation`.
- **Timezone hardcodée** : `UTC_OFFSET = 2` dans `availability.service.ts`. À remplacer par `club.timezone` + une vraie lib pour la production (changement d'heure, autres fuseaux).

---

## Reste à faire

- Inscription client (`POST /api/auth/register`) — seul le login existe aujourd'hui.
- Paiement réel à la confirmation.
- Timezone dynamique depuis `club.timezone` (au lieu de l'offset hardcodé).
