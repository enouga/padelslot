# Espace super-admin plateforme — Design (v1)

> Spec validée le 2026-06-04. Un super-administrateur de la **plateforme** (pas d'un club)
> peut consulter des statistiques globales, lister tous les clubs et les
> suspendre/réactiver, et créer un club en désignant son gérant. Périmètre v1
> volontairement étroit : **pas de modération des joueurs**, pas d'édition fine des clubs.

## 1. Objectif & périmètre

Donner à l'exploitant de Palova un espace d'administration **transverse à tous les clubs**,
distinct du back-office club (`/admin`, scopé à un club via son sous-domaine).

**Dans le périmètre v1 :**
- **Dashboard** : statistiques globales de la plateforme.
- **Clubs** : lister **tous** les clubs (tous statuts confondus) et basculer leur statut
  **ACTIVE ⇄ SUSPENDED**.
- **Créer un club** : créer un club *et* son gérant (rôle `OWNER`) en une opération ; le
  super-admin n'est pas lui-même le gérant.

**Hors périmètre v1 (évolutions futures) :**
- Modération / suppression de comptes joueurs.
- Édition détaillée d'un club (branding, ressources, sports) — ça reste au club via `/admin`.
- Suppression définitive d'un club (on suspend, on ne supprime pas).
- Gestion de plusieurs super-admins via l'UI (le flag se pose au seed / en base).
- Notifications, journal d'audit.

## 2. Décisions clés

| Sujet | Décision |
|---|---|
| Identité super-admin | Champ booléen **`User.isSuperAdmin`** (migration additive), pas un rôle club |
| Rattachement club | **Aucun** : le super-admin n'a pas de `ClubMember` |
| JWT | **Inchangé** (`{ id, email }`). Le flag est **revérifié en base** à chaque requête |
| Compte de seed | `super@palova.fr`, `isSuperAdmin: true` |
| Mot de passe seed | `process.env.SUPERADMIN_PASSWORD ?? 'password123'` (prod sûre, dev pratique) |
| Suspension | Réutilise `Club.status` (SUSPENDED masque **déjà** page publique + annuaire) |
| Création de club | Email gérant **neuf obligatoire** → `409` si déjà pris (v1 simple) |
| Hôte du front | Espace `/superadmin` servi **uniquement sur l'hôte plateforme** (`slug === null`) |
| Stats v1 | Clubs (total + ACTIVE/SUSPENDED), utilisateurs, réservations, tournois |
| Méthode | **TDD** côté backend (service → middleware → routes), puis front |

## 3. Modèle de données

Ajout d'un seul champ, **migration purement additive** (`add_super_admin`, pas de reset) :

```prisma
model User {
  // …champs existants…
  isSuperAdmin Boolean @default(false) @map("is_super_admin")
}
```

`@default(false)` → tous les comptes existants restent non-admin sans backfill.

## 4. Seed (`prisma/seed.ts`)

Ajout d'un compte super-admin, **idempotent** (upsert), sans `ClubMember` :

```ts
const superPassword = await bcrypt.hash(process.env.SUPERADMIN_PASSWORD ?? 'password123', 10);
await prisma.user.upsert({
  where: { email: 'super@palova.fr' },
  update: { isSuperAdmin: true },
  create: { email: 'super@palova.fr', password: superPassword,
            firstName: 'Super', lastName: 'Admin', isSuperAdmin: true },
});
```

- `update` force le flag à `true` (rejouable même si le compte existe déjà).
- En **prod** : poser `SUPERADMIN_PASSWORD` dans `.env.prod` **avant** de lancer le seed.
- Ajouté à `seed.ts` (canonique), **pas** à `seed-demo.ts`.

## 5. Authentification & autorisation (backend)

### 5.1 Login expose le flag
`POST /api/auth/login` : `publicUser()` renvoie `isSuperAdmin` en plus des champs actuels.
Sert uniquement à l'aiguillage UI — **l'autorisation réelle est revérifiée serveur**.

```ts
function publicUser(u) {
  return { id: u.id, email: u.email, firstName: u.firstName,
           lastName: u.lastName, isSuperAdmin: u.isSuperAdmin };
}
```
(le `findUnique` du login récupère déjà l'objet `user` complet → le champ est dispo.)

### 5.2 Middleware `requireSuperAdmin`
Nouveau `src/middleware/requireSuperAdmin.ts`, posé **après** `authMiddleware` :
- charge l'utilisateur par `req.user.id` ;
- si introuvable **ou** `!isSuperAdmin` → `403 { error: 'Accès super-admin requis' }` ;
- sinon `next()`.

Le JWT n'est pas modifié : on ne met pas le flag dans le token (révocation immédiate si on
retire le flag en base ; cohérent avec le choix existant de ne pas mettre le rôle club dans le JWT).

## 6. Routes backend `/api/platform`

Montées dans `app.ts` : `app.use('/api/platform', authMiddleware, requireSuperAdmin, platformRouter)`.
Logique métier dans un nouveau `src/services/platform.service.ts`.

| Méthode & route | Effet | Réponse |
|---|---|---|
| `GET /api/platform/stats` | Compte global | `{ clubs: { total, active, suspended }, users, reservations, tournaments }` |
| `GET /api/platform/clubs` | Tous les clubs (tous statuts) | `[{ id, slug, name, city, status, createdAt, owners:[{id,email,firstName,lastName}], counts:{ adherents, resources } }]` |
| `PATCH /api/platform/clubs/:id` | Change le statut | corps `{ status: 'ACTIVE' \| 'SUSPENDED' }` → club mis à jour. `400` si statut invalide, `404` si club inconnu |
| `POST /api/platform/clubs` | Crée club **+ gérant OWNER** | corps `{ club:{ name, city?, timezone?, sportKey? }, owner:{ firstName, lastName, email, password } }` → `201 { club, owner }`. `409` si email pris, `400` si validation, `409`/`SLUG_TAKEN` si slug pris |

### 6.1 Détail `GET /stats`
Quatre `prisma.*.count()` (clubs total + 2 `count` filtrés par statut, users, reservations,
tournaments). Réutiliser `groupBy` sur `Club.status` si plus propre.

### 6.2 Détail `GET /clubs`
`prisma.club.findMany` (aucun filtre de statut) + include :
- les gérants : relation `members` (= `ClubMember`) filtrée `role: 'OWNER'` → `user` ;
- `_count` sur `clubMemberships` (→ `adherents`, le fichier des joueurs) et `resources`.

Tri par `createdAt` desc. (Rappel : `members` = staff OWNER/ADMIN/STAFF, `clubMemberships`
= adhérents joueurs ; on compte les adhérents pour la vue plateforme.)

### 6.3 Détail `PATCH /clubs/:id`
Valide `status ∈ {ACTIVE, SUSPENDED}` (sinon 400). `prisma.club.update` ; capter
`P2025` → `404`. Note : suspendre un club le retire immédiatement de l'annuaire et bloque sa
page publique (comportement **déjà** en place via `getClubBySlug` + `listClubs`).

### 6.4 Détail `POST /clubs` (création atomique)
Dans une transaction :
1. valider les champs ; vérifier l'email gérant libre (`findFirst` insensible à la casse) → sinon `409`.
2. créer le `User` gérant (mot de passe `bcrypt.hash`, 8 caractères min comme `/register`).
3. créer le `Club` (slug = `slugify(name)`, statut `ACTIVE`), capter collision slug → `409`.
4. créer le `ClubMember { userId: owner, clubId, role: 'OWNER' }`.
5. si `sportKey` fourni et connu du catalogue → créer le `ClubSport` correspondant.

Réutiliser `slugify` (déjà exporté par `club.service`). Implémenté comme une méthode du
`platform.service` (et non `createClub` existant, qui fait du caller l'OWNER).

## 7. Front `/superadmin` (hôte plateforme uniquement)

Nouvel arbre `app/superadmin/` calqué sur le style de `app/admin/` (barre latérale thémée,
`ThemeToggle`, `logout`). **N'apparaît que sur l'hôte plateforme** : si `useClub().slug !== null`
(on est sur un sous-domaine club) → rediriger vers `/` (le `/superadmin` n'a pas de sens sur un club).

### 7.1 Garde d'accès (`app/superadmin/layout.tsx`)
- attend `useAuth().ready` ;
- pas de token → `/login` ;
- token présent → `GET /api/platform/stats` (ou un `GET /api/me`) sert de **vérification serveur** :
  un `403` ⇒ pas super-admin ⇒ redirige `/` ; un `200` ⇒ accès accordé.
  (On ne se fie pas au `isSuperAdmin` du localStorage seul ; le backend tranche.)
- Affiche un état « Chargement… » pendant la vérif (même pattern que `/admin`).

### 7.2 Pages
- `app/superadmin/page.tsx` — **Dashboard** : cartes de stats depuis `GET /stats`.
- `app/superadmin/clubs/page.tsx` — **Clubs** : tableau (nom, slug, ville, statut, gérant,
  compteurs) ; bouton **Suspendre/Réactiver** par ligne, confirmé via `ConfirmDialog`
  (`components/ui/ConfirmDialog.tsx`, variante `danger` pour suspendre).
- `app/superadmin/clubs/new/page.tsx` — **Créer un club** : formulaire club + gérant ;
  succès → retour à la liste avec le nouveau club visible.

### 7.3 Aiguillage du login (`app/login/page.tsx`)
Sur l'hôte plateforme (`slug === null`), après login : **si `data.user.isSuperAdmin`**
→ `router.push('/superadmin')` (avant la logique « premier club géré / annuaire »).
Sur un hôte club, le comportement actuel est inchangé.

### 7.4 Client API (`lib/api.ts`)
Ajouter les méthodes `platformStats(token)`, `platformClubs(token)`,
`platformSetClubStatus(token, id, status)`, `platformCreateClub(token, body)` + leurs types
(`PlatformStats`, `PlatformClub`, `CreateClubByPlatformBody`). Toutes envoient le `Bearer`.

## 8. Tests (TDD)

**Backend (Jest, dans `src/services/__tests__` + tests de routes) :**
- `platform.service` : stats agrégées correctes ; liste inclut clubs suspendus + compteurs ;
  set status valide / statut invalide ; création club+gérant OK ; **email gérant déjà pris → erreur** ;
  slug en collision → erreur.
- `requireSuperAdmin` : laisse passer un super-admin ; **403** pour un user normal ; 403 si
  user introuvable.
- Routes `/api/platform/*` : **401** sans token, **403** avec token non-admin, **200** avec super-admin.

**Frontend :** vérif `tsc` + `jest` existants restent verts (pas de nouveau test lourd exigé
en v1 ; la garde et l'aiguillage seront validés en e2e navigateur).

## 9. Vérification (rappel projet — pas de CI)
- Backend : `npx prisma generate` puis `npx tsc --noEmit` et `npx jest`.
- Frontend : `npx tsc --noEmit` et `npx jest`.
- Migration locale : `npm run db:migrate` (additive) puis `npm run db:seed` (crée `super@palova.fr`).
- e2e navigateur : login `super@palova.fr` sur l'hôte plateforme → `/superadmin` ; suspendre un
  club → vérifier qu'il disparaît de l'annuaire `/clubs` ; créer un club → le gérant peut se
  connecter et atteindre son `/admin`.

## 10. Sécurité
- Autorisation **toujours** revérifiée serveur (flag en base), jamais sur la seule réponse login.
- `SUPERADMIN_PASSWORD` posé en prod avant seed ; ne pas committer de mot de passe réel.
- Pas d'élévation de privilège possible via l'API (aucune route ne pose `isSuperAdmin`).
