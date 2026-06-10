# Calendrier dans « Mes réservations » + déplacement de réservation — Design

**Date :** 2026-06-10
**Statut :** validé (brainstorming avec maquettes navigateur, style A retenu)

## Problème

La page « Mes réservations » (`/me/reservations`) n'affiche qu'une liste de cartes (onglets À venir / Passées) et ne montre pas les inscriptions tournois. On veut une vue calendrier moderne regroupant réservations de terrain ET tournois, avec édition des entrées : annuler une réservation, gérer une inscription tournoi, et déplacer une réservation (nouvelle capacité backend).

## Design

### Onglet « Calendrier »

Troisième segment dans le Segmented existant de `/me/reservations` : « À venir | Passées | Calendrier ». Pas de nouvelle page ni de changement de navigation.

### Calendrier mensuel (style A — mois + détail du jour)

- Grille mensuelle lun→dim, navigation ‹ mois ›, aujourd'hui surligné, légende.
- Pastilles **bleu marque** (`ACCENTS.blue`, jamais `th.accent` qui est surchargé par la couleur du club) = réservations terrain, une par résa, max 3 + « +n ».
- Barre **abricot continue** (`th.accentWarm`) = tournoi, étirée du jour de début au jour de fin (`startTime`→`endTime`, un seul jour si `endTime` null). Arrondie à gauche sur le premier jour, à droite sur le dernier.
- Mois passés navigables ; entrées passées atténuées (opacité 0.4) ; entrées annulées masquées.

### Panneau du jour

Clic sur un jour → ses entrées en cartes sous la grille (style des cartes existantes de la page) :

- **Réservation terrain** : terrain, club, statut (Chip), horaires, prix. Si à venir : boutons **Déplacer** et **Annuler** (ConfirmDialog + `DELETE /api/reservations/:id` existants).
- **Tournoi** : nom, catégorie/genre, dates, statut inscription (CONFIRMED/WAITLISTED), bouton **Gérer** → `/tournois/[id]` (annulation et changement de coéquipier y existent déjà).
- **Jour vide** : « Rien ce jour-là » + bouton « Réserver un terrain ».
- Multi-hôtes : Déplacer/Gérer/Réserver seulement quand la page est servie sur l'hôte du club concerné (slug correspondant).

### Déplacement de réservation

- « Déplacer » ouvre la page Réserver avec `?move=<reservationId>` : **mode déplacement** — bandeau abricot rappelant la résa d'origine (terrain, date, heures) + bouton **Abandonner** ; date et durée pré-sélectionnées ; choix libre de date/terrain/créneau dans le même club.
- La confirmation appelle un **nouvel endpoint atomique** `POST /api/reservations/:id/reschedule` `{ resourceId, startTime, duration }` :
  - Gardes : propriétaire uniquement, statut PENDING/CONFIRMED, résa future, ressource du même club, heures ouvrées (heure locale club), fenêtre de réservation + membership (mécanique existante).
  - Verrou Redis SET NX sur le nouveau créneau (sauf clé identique à l'ancienne = changement de durée seule).
  - Transaction Serializable + SELECT FOR UPDATE : re-check du statut, comptage des conflits avec `id != reservationId` (déplacer vers un créneau chevauchant l'ancien fonctionne), création de la nouvelle résa CONFIRMED, ancienne → CANCELLED. Prix recalculé (heures pleines/creuses).
  - SSE : `slot_released` (ancien créneau) + `slot_confirmed` (nouveau).
  - **Tout échec laisse l'ancienne réservation intacte.**
- Dans BookingModal en mode move : pas de phase hold (pas de TTL 10 min) ; bouton « Déplacer ici » ; la fermeture n'annule rien.

### Données

Fusion **côté client** des deux endpoints existants `GET /api/me/reservations` + `GET /api/me/tournaments` — aucun nouvel endpoint de lecture. Logique pure dans `frontend/lib/calendar.ts` : conversion instant→jour une seule fois via `Intl.DateTimeFormat` avec le **fuseau du club de chaque entrée**, puis arithmétique de clés `YYYY-MM-DD` en UTC pur (anti-bugs DST). « Aujourd'hui » = fuseau du navigateur (choix assumé).

### Composants

- `frontend/lib/calendar.ts` — helpers purs testés (grille du mois, clés jour, fusion des entrées, index par jour).
- `frontend/components/calendar/MonthCalendar.tsx` — grille mensuelle.
- `frontend/components/calendar/DayPanel.tsx` — entrées du jour + actions.
- Modifications : `app/me/reservations/page.tsx`, `components/ClubReserve.tsx`, `components/BookingModal.tsx`, `lib/api.ts`, backend `reservation.service.ts` + `routes/reservations.ts`.

### Tests

- Backend : Jest sur `rescheduleReservation` (happy path, auto-chevauchement, conflits, locks, gardes, tarif heures creuses).
- Frontend : Jest+RTL — `calendar.test.ts` (lib pure), `MonthCalendar`, `DayPanel`, intégration page, mode move de `ClubReserve` et `BookingModal`.

## Hors périmètre

Édition d'autres champs (durée seule via le flux déplacement), déplacement inter-clubs, notifications e-mail, vue semaine/timeline.

## Plan d'implémentation

`docs/superpowers/plans/2026-06-10-calendrier-mes-reservations.md` (copie du plan approuvé).
