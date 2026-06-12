# Palova

**Plateforme SaaS multi-sports / multi-clubs** de réservation de terrains : un club s'inscrit et gère tout en autonomie ; un joueur (compte unique) trouve un club et réserve en temps réel. Garanties : **zéro double-booking** + **disponibilités en direct** (SSE).

Monorepo découplé : une **API Express** (`backend/`) et un **frontend Next.js** (`frontend/`), avec **PostgreSQL** et **Redis** via Docker.

> 📄 Stack technique détaillée → [`STACK.md`](./STACK.md) · API et endpoints → [`backend/README.md`](./backend/README.md)

---

## Feuille de route

### ✅ Fait
- **Multi-tenant multi-sports** : modèle Sport (catalogue) / Club / ClubSport / Resource / ClubMember ; isolation par club.
- **Auto-inscription club** self-service (`/clubs/new`) + back-office complet (profil, **branding** couleur/logo/thème, sports, ressources, réservations).
- **Rôles club** OWNER / ADMIN / STAFF (`requireClubMember`) ; compte joueur global.
- **Marketplace joueur** : annuaire `/clubs` (recherche sport/ville), pages club brandées `/c/{slug}`, inscription `/register`.
- **Réservation temps réel** : créneaux configurables, hold Redis 10 min + confirmation PostgreSQL Serializable, SSE, fuseau horaire par club.
- **Paiements (encaissement manuel)** : registre par réservation (montant, moyen, payeur) + payé / reste dû, côté back-office.
- **Pas de créneau par terrain** : chaque ressource choisit sa granularité (multiple de 15 min), repli sur le réglage du sport.
- **Caractéristiques de terrain** : surface (indoor / outdoor) **et** format (double / single), indépendants ; affichés côté joueur et back-office.
- **Vues planning** : grille de réservation multi-terrains côté joueur (page club, onglet « Réserver », créneaux réservés grisés/barrés) + planning du jour côté admin (`/admin/planning`, terrains × heures).
- **Abonnés & fenêtres de réservation** : le club fixe le nombre de jours de réservation à l'avance (public / abonnés) ; les **abonnés** réservent plus tôt. L'abonnement est attribué par le club (`/admin/members`) — pas d'auto-abonnement en ligne ; le joueur voit son statut (badge « Abonné ») en lecture seule. Fenêtre appliquée côté serveur (`BOOKING_TOO_FAR`) et dans les jours proposés.
- **Espace joueur** : page « Mes réservations » (à venir / passées, annulation). Logo contextuel (joueur → ses résas, club → back-office).
- **Design system Palova** : thème clair/sombre + accent par club, sur toutes les pages.

### ⏳ À faire
- **Paiement en ligne** (Stripe) + **paiement partagé** entre joueurs (part par joueur).
- **Espace joueur** : profil, historique enrichi, favoris.
- **Sous-domaines par club** (`monclub.palova.com`) + branding poussé.
- **Monétisation** : abonnement club (B2B) / premium joueur.
- Cours & coachs, parties publiques (matchmaking), notifications/e-mails.
- Décision **rebrand** éventuel (« Palova ») — l'UI actuelle est « Palova ».

---

## Prérequis

- **Node.js 20+**
- **Docker** (pour PostgreSQL + Redis)
  > ⚠️ Docker Desktop 20.10.23 n'a pas le plugin `compose`. Utiliser `docker-compose-v1.exe` (voir ci-dessous), jamais `docker compose`.

---

## Démarrage rapide

Trois terminaux (ou trois étapes successives).

### 1. Bases de données (PostgreSQL + Redis)

```bash
"C:\Program Files\Docker\Docker\resources\bin\docker-compose-v1.exe" up -d
```

Vérifier : `docker ps` → `palova_postgres_1` et `palova_redis_1` en `(healthy)`.

### 2. Backend (API — port 3001)

```bash
cd backend
npm install
npm run db:migrate     # crée les tables (première fois)
npm run db:seed        # données de démo (club, terrains, utilisateur)
npm run dev
```

### 3. Frontend (web — port 3000)

```bash
cd frontend
npm install
npm run dev
```

➡️ Ouvrir **http://localhost:3000**

---

## URLs & ports

| Service | URL / Port | Notes |
|---------|-----------|-------|
| Frontend | http://localhost:3000 | Next.js |
| API backend | http://localhost:3001 | Express — `GET /health` → `{"status":"ok"}` |
| PostgreSQL | `localhost:5432` | base `palova` |
| Redis | `localhost:6379` | verrous de réservation |
| Prisma Studio | port affiché au lancement | `npx prisma studio` (depuis `backend/`) — ou `--port 5555` pour le fixer |

---

## Comptes de démo (après `npm run db:seed`)

Mot de passe commun : **`password123`**. Tous rattachés au club de démo *Padel Arena Paris*.

| Rôle | Email | Type |
|------|-------|------|
| **Owner** (propriétaire) | `super@palova.fr` | super-admin plateforme |  redirigé vers /superadmin
| **Owner** (propriétaire) | `owner@palova.fr` | membre du club |
| **Admin** (gestionnaire) | `admin@palova.fr` | membre du club |
| **Staff** (équipe) | `staff@palova.fr` | membre du club |
| **Joueur** (client) | `joueur@palova.fr` | compte simple, aucun club |
| Owner (compte historique) | `test@palova.fr` | membre du club |

> Les rôles club sont portés par `ClubMember` (`OWNER` > `ADMIN` > `STAFF`). Un compte sans rattachement à un club est un **joueur**.

## Pages par rôle

| Page | URL | Visiteur | Joueur | Staff / Admin / Owner |
|------|-----|:--------:|:------:|:---------------------:|
| Accueil (landing) | `/` | ✅ | ✅ | ✅ |
| Annuaire des clubs | `/clubs` | ✅ | ✅ | ✅ |
| Page club (brandée) | `/c/{slug}` | ✅ | ✅ | ✅ |
| Réserver un créneau | `/courts/{id}` | → login | ✅ (hold + confirmer) | ✅ |
| Connexion | `/login` | ✅ | ✅ | ✅ |
| Inscription joueur | `/register` | ✅ | — | — |
| Créer un club (onboarding) | `/clubs/new` | ✅ | ✅ | ✅ |
| Back-office — tableau de bord | `/admin` | ❌ | ❌ → `/clubs` | ✅ |
| Back-office — planning du jour | `/admin/planning` | ❌ | ❌ | ✅ |
| Back-office — ressources | `/admin/courts` | ❌ | ❌ | ✅ |
| Back-office — sports | `/admin/sports` | ❌ | ❌ | ✅ |
| Back-office — réservations & paiements | `/admin/reservations` | ❌ | ❌ | ✅ |
| Back-office — membres & abonnés | `/admin/members` | ❌ | ❌ | ✅ |
| Back-office — annonces | `/admin/announcements` | ❌ | ❌ | ✅ |
| Back-office — partenaires | `/admin/sponsors` | ❌ | ❌ | ✅ |
| Back-office — réglages & branding | `/admin/settings` | ❌ | ❌ | ✅ |

> `/courts` (ancienne liste mono-club) redirige désormais vers l'annuaire `/clubs`.

**Comportement** : à la connexion, un membre d'un club est redirigé vers `/admin` ; un joueur vers `/clubs`. Le back-office est protégé côté serveur (`requireClubMember`) et côté UX (garde de route dans `app/admin/layout.tsx`).

**Déconnexion** : bouton dédié dans l'en-tête du back-office et de l'annuaire / page club. Efface la session locale (`token`, `clubId`) et renvoie vers `/login`.

> ℹ️ Aujourd'hui, tout membre du club (y compris **Staff**) a accès au back-office complet. Les **permissions fines par rôle** (ex. Staff en lecture seule sur le branding) sont une évolution prévue.

---

## Accéder aux données

### PostgreSQL

| Paramètre | Valeur |
|-----------|--------|
| Hôte / Port | `localhost` / `5432` |
| Base | `palova` |
| Utilisateur | `palovauser` |
| Mot de passe | `palovapass` |
| URL | `postgresql://palovauser:palovapass@localhost:5432/palova` |

**Interface graphique (recommandé)** — depuis `backend/` :
```bash
npx prisma studio                 # le port est affiché au lancement (ex. http://localhost:5555)
npx prisma studio --port 5555     # pour fixer le port à 5555
```

**En ligne de commande** (psql est dans le conteneur Docker) :
```bash
docker exec -it palova_postgres_1 psql -U palovauser -d palova
# \dt  lister les tables · \d courts  décrire · \q  quitter
```

**Client graphique externe** : DBeaver / TablePlus / pgAdmin avec les paramètres ci-dessus.

### Redis

```bash
docker exec -it palova_redis_1 redis-cli
# KEYS lock:*   voir les verrous de réservation actifs
```

---

## Commandes utiles

### Backend (`cd backend`)
```bash
npm run dev          # serveur de dev (nodemon)
npm run build        # compile TypeScript → dist/
npm start            # lance la version compilée (prod)
npm test             # tests Jest
npm run db:migrate   # migrations Prisma
npm run db:seed      # données de démo
npx prisma studio    # explorer la base
```

### Frontend (`cd frontend`)
```bash
npm run dev          # serveur de dev (port 3000)
npm run build        # build de production
npm start            # lance le build
npm test             # tests React Testing Library
npm run lint         # ESLint
```

---

## Structure du projet

```
palova/
├── docker-compose.yml      PostgreSQL 16 + Redis 7
├── README.md               ce fichier
├── STACK.md                stack technique complète + hébergement
├── CLAUDE.md               instructions projet (assistant)
├── backend/                API Express 5 + Prisma 7 + Redis (port 3001)
│   ├── README.md           doc de l'API (endpoints, auth, logique métier)
│   ├── prisma/             schéma + seed
│   └── src/                routes, services, middlewares, jobs
└── frontend/               Next.js 16 + React 19 + Tailwind 4 (port 3000)
    ├── app/                pages (App Router)
    ├── components/ui/      design system Palova
    ├── lib/                thème, API client, hooks
    └── design/             maquette source (prototype, hors build)
```

---

## Déploiement

Voir la section **Hébergement** de [`STACK.md`](./STACK.md). En résumé : un serveur Node **persistant** est requis (SSE temps réel + cron) — **Railway** ou **Render** pour tout, ou **Vercel** (frontend) + **Railway/Render** (backend + PostgreSQL + Redis).
