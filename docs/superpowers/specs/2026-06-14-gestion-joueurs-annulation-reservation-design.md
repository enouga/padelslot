# Design — Gérer les joueurs & annuler une réservation depuis « Mes réservations »

**Date :** 2026-06-14
**Statut :** validé (brainstorming) — en attente de relecture utilisateur avant plan d'implémentation
**Approche retenue :** A — réutiliser `ReservationParticipant` + endpoints scopés au propriétaire

## Objectif

Depuis la page « Mes réservations », permettre à l'organisateur d'une réservation à venir de :
1. **Ajouter / retirer des joueurs** à sa partie ;
2. **Annuler** sa réservation,

le tout encadré par des **délais configurables par le club**.

## Décisions de cadrage

| Sujet | Décision |
|---|---|
| Qui peut être ajouté | **Membres ACTIFS du club uniquement** |
| Impact paiement | **Purement informatif** — on enregistre qui joue, aucun paiement déclenché ; l'organisateur reste responsable du montant total |
| Fenêtre temporelle | **Délais configurables par club** : un délai « changement de joueurs », un délai « annulation » |
| Sélection du membre | **Autocomplétion par nom** parmi les membres du club |
| Permissions | **Organisateur uniquement** (`reservation.userId`) |
| Notifications aux joueurs ajoutés/retirés | **Hors périmètre v1** (infra email en WIP) — candidat pour une suite |

## 1. Modèle de données

### Club (2 nouvelles colonnes)
`backend/prisma/schema.prisma` — modèle `Club` :

```prisma
playerChangeCutoffHours Int @default(0) @map("player_change_cutoff_hours")
cancellationCutoffHours Int @default(0) @map("cancellation_cutoff_hours")
```

- Unité : **heures avant `startTime`**.
- Défaut `0` = action autorisée **jusqu'au début de la partie** (préserve le comportement actuel ; le club peut durcir).
- Clamp **0–365** (cohérent avec `publicBookingDays`/`memberBookingDays`).
- Migration Prisma à générer.

### Joueurs
On réutilise `ReservationParticipant` sans changement de schéma :
- **Organisateur** = `reservation.user` (toujours affiché en premier, **non retirable**). Pas besoin d'une ligne participant pour lui.
- **Joueurs ajoutés** = lignes `ReservationParticipant` avec `isOrganizer=false` et **`share=0`** (informatif → aucune obligation de paiement, aucun `Payment` créé).
- On **ne déclenche pas** le `splitShares` du flux admin. (Note : si un admin édite ensuite les participants, son recalcul de parts peut écraser `share=0` — comportement admin assumé, hors périmètre.)

## 2. Backend — endpoints scopés au propriétaire

`backend/src/routes/reservations.ts` + `backend/src/services/reservation.service.ts`

| Méthode | Endpoint | Rôle |
|---|---|---|
| `POST` | `/api/reservations/:id/players` `{ memberUserId }` | Ajoute un membre (share=0) |
| `DELETE` | `/api/reservations/:id/players/:participantId` | Retire un joueur ajouté |
| `DELETE` | `/api/reservations/:id` (existant) | Annulation — **reçoit le contrôle de délai** |

### Chargement du club pour les délais
Chemin de relation : `Reservation → Resource → Club`.

```ts
include: { resource: { select: { clubId: true, club: { select: {
  timezone: true, playerChangeCutoffHours: true, cancellationCutoffHours: true,
} } } } }
```

### Validations — ajout / retrait de joueur
- Réservation existe, statut `CONFIRMED` (sinon `RESERVATION_NOT_FOUND` / `RESERVATION_NOT_EDITABLE`).
- Demandeur = `reservation.userId` sinon `UNAUTHORIZED` (organisateur uniquement).
- `now ≤ startTime − playerChangeCutoffHours` sinon `PLAYER_CHANGE_TOO_LATE`.
- (Ajout) le membre est `ACTIVE` dans **le même club** sinon `NOT_A_MEMBER`.
- (Ajout) pas déjà participant ni l'organisateur sinon `ALREADY_PLAYER`.
- (Ajout) capacité non dépassée : `participantsCount + 1 (organisateur) < playerCount(format)` sinon `CAPACITY_EXCEEDED`. `playerCount(format)` dérivé de `Resource.attributes.format` (ex. double → 4, donc max 3 joueurs ajoutés).
- (Retrait) la ligne participant existe et appartient à cette résa sinon `PARTICIPANT_NOT_FOUND`.

### Validation — annulation (ajout au flux existant)
- Checks existants conservés (`RESERVATION_NOT_FOUND`, `UNAUTHORIZED`, `ALREADY_CANCELLED`).
- `now ≤ startTime − cancellationCutoffHours` sinon `CANCELLATION_TOO_LATE`.

## 3. Backend — recherche de membres (autocomplétion)

Nouvel endpoint accessible aux **membres** (pas seulement admin) :

`GET /api/clubs/:clubId/members/search?q=<nom>` → `[{ userId, firstName, lastName }]`

- Accès : le demandeur est **membre ACTIF** du club ciblé.
- Renvoie **uniquement** les membres `ACTIVE` du club, **champs minimaux** (nom/prénom — **pas** d'e-mail ni téléphone).
- Recherche insensible à la casse sur prénom/nom, limitée (ex. 10 résultats).

## 4. Frontend — UX

### Points d'entrée
- `frontend/app/me/reservations/page.tsx` : sur chaque carte de résa **à venir**, bouton **« Gérer les joueurs »** à côté de « Annuler ».
- `frontend/components/calendar/DayPanel.tsx` : même bouton pour les résas à venir.

### `ManagePlayersModal` (nouveau composant)
- En-tête : date + court + club ; indicateur de capacité (ex. *3/4 joueurs*).
- Liste : **Organisateur (toi)** non retirable, puis puces des joueurs ajoutés avec « ✕ retirer ».
- **« + Ajouter un joueur »** → champ d'autocomplétion (debounce) appelant `members/search`, sélection → `POST .../players`.
- Si **délai de changement dépassé** : modal en lecture seule + message (« Modification des joueurs fermée Xh avant le début »).
- Bouton **« Annuler la réservation »** : désactivé si délai d'annulation dépassé, avec message.
- Mapping des codes d'erreur backend → messages FR.

### `MemberSearch` (nouveau composant)
Autocomplétion réutilisable (inspirée du pattern `PlayerPicker`, mais contexte membre) appelant le nouvel endpoint de recherche.

## 5. Admin — réglages

`frontend/app/admin/settings/page.tsx` : nouvelle carte **« Délais (annulation & changement de joueurs) »** avec deux champs `number` (heures), sauvegarde via `api.adminUpdateClub` existant.

Backend : étendre `UpdateClubBody` et `clubService.updateClub()` (`backend/src/services/club.service.ts`) avec `playerChangeCutoffHours?` / `cancellationCutoffHours?` (clamp 0–365), merge conditionnel comme les autres champs.

## 6. Codes d'erreur (→ messages FR)

| Code | Message UI (indicatif) |
|---|---|
| `PLAYER_CHANGE_TOO_LATE` | « Trop tard pour modifier les joueurs (clôture Xh avant le début). » |
| `CANCELLATION_TOO_LATE` | « Trop tard pour annuler (clôture Xh avant le début). » |
| `CAPACITY_EXCEEDED` | « La partie est complète. » |
| `NOT_A_MEMBER` | « Ce joueur n'est pas membre du club. » |
| `ALREADY_PLAYER` | « Ce joueur est déjà dans la partie. » |
| `UNAUTHORIZED` | « Seul l'organisateur peut modifier cette réservation. » |

## 7. Hors périmètre v1
- Notifications (email/push) aux joueurs ajoutés/retirés.
- Flux d'invitation/acceptation (la partie n'apparaît pas dans les « Mes réservations » des joueurs ajoutés).
- Reprogrammation (reschedule) — suivie ailleurs.

## 8. Tests (gate jest, Prisma mocké)
- **Service réservation** : ajout (succès, capacité, trop tard, non-membre, doublon, non-organisateur), retrait (succès, participant absent), annulation (dans/hors délai).
- **Service club** : `updateClub` clamp 0–365 des deux nouveaux champs.
- **Recherche membres** : filtre club + statut ACTIVE, champs minimaux, accès refusé aux non-membres.
- **Frontend** (si setup de tests) : comportement du modal (lecture seule hors délai, capacité, retrait).

## 9. Fichiers impactés (estimation)
**Backend** : `prisma/schema.prisma` (+migration), `src/services/reservation.service.ts`, `src/routes/reservations.ts`, `src/services/club.service.ts`, `src/routes/admin.ts` (ou route membres pour la recherche), types.
**Frontend** : `app/me/reservations/page.tsx`, `components/calendar/DayPanel.tsx`, `components/.../ManagePlayersModal.tsx` (nouveau), `components/.../MemberSearch.tsx` (nouveau), `lib/api.ts`, `app/admin/settings/page.tsx`, types.
