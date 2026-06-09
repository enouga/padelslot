# Tournois — Licence saisie par le joueur + annuaire de coéquipier (design)

> Spec v1. Date : 2026-06-09. Évolution de la v1 tournois (inscriptions). Spec d'origine : `2026-06-03-tournois-padel-design.md`.

## Contexte

L'inscription à un tournoi exige que les **deux joueurs** soient membres du club avec **téléphone + licence + sexe** renseignés. Aujourd'hui :

- La **licence** = `ClubMembership.membershipNo` (« n° adhérent / licence », par club). Elle n'est saisissable **que par le club** dans `/admin/members`.
- Le **coéquipier** est désigné en **tapant son e-mail** dans la page `/tournois/[id]`.
- Lors de l'inscription, `TournamentService.resolveAndAssertEligible` résout le coéquipier par e-mail puis vérifie membre / téléphone / licence / sexe / genre.

Deux évolutions demandées :

- **A.** Permettre au **joueur** de saisir **sa propre licence**.
- **B.** Remplacer le champ e-mail par un **annuaire de recherche par nom**.

## Décisions de cadrage (validées)

1. **Licence** : « remplir si vide, modifiable ensuite ». Le joueur écrit dans le **même champ** que le club (`ClubMembership.membershipNo`) ; dernier qui écrit gagne.
2. **Annuaire** : recherche parmi **tous les membres actifs** du club ; la compatibilité (sexe selon catégorie, licence/téléphone) est vérifiée **à l'inscription** (pas de pré-filtre qui révélerait le statut de profil des autres).
3. **Identité du coéquipier** : approche « par identifiant ». La recherche renvoie `{ id, firstName, lastName }` **sans e-mail** ; la sélection envoie un `partnerUserId`. **Pas** de champ e-mail de repli (YAGNI : le coéquipier est forcément membre, donc dans l'annuaire).

## A. Licence saisie par le joueur

### Backend (routes club-scoped, `backend/src/routes/clubs.ts`)

- `GET /api/clubs/:slug/me/membership` — **auth**. Renvoie l'adhésion du joueur connecté à ce club : `{ membershipNo, status, isSubscriber }`. `404 MEMBERSHIP_REQUIRED` s'il n'est pas membre. Sert à pré-remplir et savoir si la licence manque.
- `PATCH /api/clubs/:slug/me/membership` — **auth**, body `{ membershipNo: string }`. Le joueur doit être membre **actif** du club (sinon `403 MEMBERSHIP_REQUIRED` / `MEMBERSHIP_BLOCKED`). `membershipNo` est `trim()` ; vide → `400 VALIDATION_ERROR`. Écrit sur **sa propre** `ClubMembership`. Renvoie l'adhésion mise à jour.
- Note : la **politique « remplir si vide »** est portée par l'UX (champ pré-rempli, librement éditable). Le backend autorise l'écriture quelle que soit la valeur courante (dernier qui écrit gagne) — cohérent avec la décision 1.

### Frontend (`frontend/app/tournois/[id]/page.tsx`)

- Au chargement (joueur connecté), lire la licence du club courant via `GET /api/clubs/:slug/me/membership`.
- `profileIncomplete = !phone || !sex || !license`.
- La carte **« Complétez votre profil »** (`ProfileCompletion`) gagne un champ **Licence** (texte) à côté de Téléphone + Sexe.
- `saveProfile` : `PATCH /api/me` (téléphone + sexe, niveau compte) **puis** `PATCH /api/clubs/:slug/me/membership` (licence, niveau club). Recharge le profil + l'adhésion.
- `lib/api.ts` : `getMyClubMembership(slug, token)` et `updateMyClubMembership(slug, membershipNo, token)`.

## B. Annuaire de recherche du coéquipier

### Backend — recherche (`backend/src/routes/clubs.ts`)

- `GET /api/clubs/:slug/members/search?q=<texte>` — **auth**. L'appelant doit être membre **actif** du club (sinon `403 MEMBERSHIP_REQUIRED`). `q` est `trim()` ; longueur < 2 → renvoie `[]`. Renvoie ≤ **20** membres **actifs** (statut ≠ `BLOCKED`) dont `firstName` **ou** `lastName` contient `q` (insensible à la casse), chacun `{ id, firstName, lastName }`. **Exclut l'appelant.** Tri `lastName, firstName`. **Aucune** donnée de contact (pas d'e-mail).

### Backend — service (`backend/src/services/tournament.service.ts`)

- `register` et `changePartner` prennent un **`partnerUserId`** (au lieu de `partnerEmail`).
- `resolveAndAssertEligible` résout le coéquipier **par id** (`prisma.user.findUnique({ where: { id } })`). Si l'id n'existe pas / pas membre → mêmes erreurs (`PARTNER_NOT_FOUND` / `MEMBERSHIP_REQUIRED` avec `subject: 'partner'`). Tous les autres contrôles (téléphone, licence, sexe, genre, doublon, `PARTNER_IS_SELF`) inchangés.

### Backend — routes joueur (`backend/src/routes/tournaments.ts`)

- `POST /api/tournaments/:id/register` body `{ partnerUserId }` (400 si absent).
- `PATCH /api/tournaments/:id/registration` body `{ partnerUserId }` (400 si absent).
- Table `ERROR_STATUS` inchangée.

### Frontend (`frontend/app/tournois/[id]/page.tsx`)

- Remplacer l'`<input>` e-mail par un composant **`PartnerSearch`** : saisie débouncée (~250 ms) → `GET .../members/search?q=` → liste déroulante des correspondances → clic = coéquipier choisi (nom affiché + `partnerUserId` mémorisé) ; possibilité d'effacer pour re-chercher.
- Boutons « S'inscrire » et « Changer de coéquipier » envoient `partnerUserId`.
- `lib/api.ts` : `searchClubMembers(slug, q, token)` ; `registerTournament(id, partnerUserId, token)` et `changeTournamentPartner(id, partnerUserId, token)` passent à `partnerUserId`.

## Sécurité & confidentialité

- Les 3 nouvelles routes exigent `authMiddleware` **et** une adhésion active au club ciblé (résolu par `slug`).
- La recherche ne renvoie **jamais** d'e-mail ni de téléphone — uniquement `id` + nom/prénom.
- L'écriture de licence ne touche **que** l'adhésion de l'appelant.

## Tests

- **Service** : tests `register`/`changePartner` existants adaptés à `partnerUserId` ; nouveaux cas — résolution par id, `PARTNER_NOT_FOUND` si id inconnu.
- **Routes** : recherche (gate membre, longueur < 2 → `[]`, exclusion de soi), licence (gate membre/bloqué, vide rejeté, écriture OK).
- **Frontend** : compilation TS ; lint propre ; vérif manuelle du flux (recherche → sélection → inscription, et saisie licence).

## Hors périmètre (YAGNI)

- Pas de champ e-mail de repli.
- Pas de licence globale au niveau compte (`User`) — elle reste par club.
- Pas de recherche floue / classée — simple `contains` insensible à la casse.
- Pas de pagination de la recherche (limite fixe 20).

## Migration

- **Aucune.** `membershipNo` existe déjà sur `ClubMembership` ; aucun nouveau champ.
