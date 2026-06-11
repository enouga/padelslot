# Events & animations — onglet unique, événements avec inscriptions (design)

**Date :** 2026-06-11
**Statut :** validé (brainstorming — approche B retenue : nouveau modèle `ClubEvent` à côté de `Tournament` ; libellé « Events » choisi)

## Objectif

L'onglet « Tournois » ne couvre que les tournois homologués. Le club organise aussi des **mêlées/americano, stages, soirées, initiations** — aujourd'hui invisibles côté joueur. On remplace l'onglet par un **« Events »** unique qui rassemble tout ce que le club programme, avec **inscription individuelle en ligne** pour les animations.

Décisions de cadrage (validées) :
- **Onglet unique** « Events » avec filtre `[ Tout | Compétitions | Animations ]` — pas de 5e onglet, pas d'onglet vide pour les petits clubs ; la mêlée est rangée côté Animations.
- **Vrais événements avec inscriptions** dès la v1 (pas une page vitrine).
- **Accès configurable par événement** : case « réservé aux membres » (une soirée club = membres ; une initiation portes ouvertes = tout compte connecté, levier de recrutement).
- **Places limitées comme les tournois** : capacité optionnelle + liste d'attente avec promotion automatique.
- **Tarif informatif** (« règlement au club »), cohérent avec `entryFee` des tournois et l'absence de paiement en ligne.

## Approche retenue

**B — Nouveau modèle `ClubEvent` + `EventRegistration` à côté de `Tournament`.** Zéro risque sur le code tournoi éprouvé (binôme, contrôle 1H+1F, licence) ; chaque modèle reste simple et typé pour son métier ; la page Agenda fusionne les deux sources côté client — pattern déjà utilisé par le calendrier « Mes réservations » (réservations + tournois).

Écartées : généraliser `Tournament` avec un champ `kind` (modèle fourre-tout, champs « obligatoires sauf si », migration invasive) ; sur-modèle `Event` avec extension 1-1 (refonte complète tournois pour un bénéfice esthétique).

## Modèle de données (migration additive `add_club_events`)

```prisma
enum ClubEventKind   { MELEE  STAGE  SOIREE  INITIATION  AUTRE }
enum ClubEventStatus { DRAFT  PUBLISHED  CANCELLED }   // même cycle que TournamentStatus

model ClubEvent {
  id                   String          @id @default(cuid())
  clubId               String
  name                 String
  kind                 ClubEventKind
  description          String?
  startTime            DateTime        @db.Timestamptz
  endTime              DateTime?       @db.Timestamptz
  registrationDeadline DateTime        @db.Timestamptz
  capacity             Int?            // null = illimité
  price                Decimal?        // informatif — « règlement au club »
  memberOnly           Boolean         @default(true)
  status               ClubEventStatus @default(DRAFT)
  // + createdAt/updatedAt, relation Club (Cascade), index [clubId, status, startTime]
}

model EventRegistration {
  id          String             @id @default(cuid())
  eventId     String
  userId      String
  status      RegistrationStatus // enum existant : CONFIRMED | WAITLISTED | CANCELLED
  cancelledAt DateTime?
  createdAt   DateTime           @default(now()) // = ordre de liste d'attente
  @@unique([eventId, userId])    // une seule inscription par joueur et par événement
}
```

Rien ne change sur les tables existantes. `RegistrationStatus` est réutilisé tel quel.

## Backend — `EventService` + routes

Miroir de `TournamentService`, en plus simple (pas de binôme, pas de genre/licence) :

- **`register(eventId, userId)`** — transaction Serializable + verrou de l'événement (`SELECT … FOR UPDATE`) : vérifie `status = PUBLISHED`, deadline non passée, `memberOnly` → membership ACTIVE du club, pas d'inscription active existante. Statut résultant : `CONFIRMED` si `capacity` null ou non atteinte, sinon `WAITLISTED`. Pas de sur-réservation de la dernière place possible.
- **`cancelRegistration(eventId, userId)`** — passe `CANCELLED` (+ `cancelledAt`) et, si l'inscription était `CONFIRMED`, **promeut le premier `WAITLISTED`** (ordre `createdAt`) — même mécanique que `tournament.service.ts`. Annulation possible jusqu'à la deadline.
- **Réinscription après annulation** : l'unicité `[eventId, userId]` porte sur la ligne ; une réinscription **met à jour** la ligne CANCELLED (statut recalculé, `cancelledAt` remis à null, **`createdAt` remis à maintenant**) — le joueur repart en fin de liste d'attente, il ne récupère pas son ancienne position.

Routes publiques (mêmes formes que `/api/tournaments/*`) :
- `GET /api/clubs/:slug/events` — événements `PUBLISHED` à venir + compteurs `confirmedCount`/`waitlistCount`
- `GET /api/events/:id` — détail (+ statut de l'inscription du joueur connecté le cas échéant)
- `POST /api/events/:id/register` (auth)
- `DELETE /api/events/:id/registration` (auth)

Routes admin (scopées club, derrière `requireClubMember`) :
- CRUD `/api/clubs/:clubId/admin/events` (+ transitions DRAFT→PUBLISHED→CANCELLED)
- `GET /api/clubs/:clubId/admin/events/:id/registrations` — liste des inscrits avec statut

Et `GET /api/me/events` à côté de `/api/me/tournaments` (alimentera le calendrier perso ensuite).

## Frontend joueur — `/events`

- **Nav (`ClubNav.tsx`)** : l'onglet « Tournois » devient `{ label: 'Events', href: '/events' }`. Icône : `trophy` conservée par défaut (`calendar` est prise par Réserver) — remplaçable si une icône plus neutre existe dans le set au moment du code.
- **Page `/events`** : fusion client de `GET …/tournaments` + `GET …/events`, tri par `startTime`. Filtre en tête `[ Tout | Compétitions | Animations ]` (Compétitions = tournois, Animations = ClubEvents). Carte tournoi → `/tournois/[id]` (page existante intacte) ; carte animation → `/events/[id]`. Helpers purs de fusion/filtre dans `lib/events.ts`.
- **Fiche `/events/[id]`** : badge du kind (Mêlée, Stage, Soirée, Initiation, Autre), date/heure, prix « X € — règlement au club », places restantes (réutilise le pattern `tournamentPlacesLabel` : « Plus que X places », « Complet · liste d'attente possible »), bouton **S'inscrire** / **Rejoindre la liste d'attente** / **Se désinscrire** (jusqu'à la deadline). `memberOnly` et non-membre → message explicite (pas de bouton).
- **Redirections** : `/tournois` → `/events?filtre=competitions` ; `/tournois/[id]` ne bouge pas (liens existants, calendrier, club-house).
- **Club-house** : le bloc « Prochains tournois » devient « Prochains events » et mélange tournois + animations (2-3 prochains, même règle d'urgence des places).

## Frontend admin — `/admin/events`

Page sœur de `/admin/tournaments` : liste des événements, formulaire création/édition (kind, nom, description, dates, deadline, capacité, prix, memberOnly), publication/annulation, liste des inscrits avec statut. Entrée « Animations » dans le menu admin.

## Garde-fous & tests

- **Concurrence** : verrou transactionnel sur l'événement à l'inscription — deux joueurs ne prennent pas la même dernière place.
- **Tests Jest backend** (`event.service.test.ts`) : inscription confirmée / liste d'attente quand complet / refus memberOnly non-membre / refus deadline passée / refus doublon / refus DRAFT ; annulation + promotion du 1er en liste d'attente ; CRUD admin scopé club (pas d'accès cross-club).
- **Tests front** : helpers `lib/events.ts` (fusion, tri, filtre), libellé des places.

## Hors v1 (exclusions confirmées)

Blocage automatique de terrains par un événement, notifications e-mail (promotion liste d'attente, rappels), paiement en ligne, récurrence (cours collectifs hebdo), encaissement relié à la caisse (le prix reste informatif).
