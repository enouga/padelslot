# Heure d'ouverture des réservations configurable — Design

**Date :** 2026-06-15
**Statut :** validé (prêt pour plan d'implémentation)

## Contexte & problème

Aujourd'hui, la fenêtre de réservation d'un club est exprimée en **nombre de jours**
(`Club.publicBookingDays`, défaut 7 ; `Club.memberBookingDays`, défaut 14 pour les abonnés).
L'enforcement vit dans `reservation.service.ts` → `assertMembershipAndWindow` :

```
maxDate = now(tz).startOf('day').plus({ days: windowDays }).endOf('day')
// refus si startLocal > maxDate  → erreur BOOKING_TOO_FAR
```

Comme le calcul repart de `startOf('day')`, la fenêtre glisse **à minuit (00:00, fuseau du
club)** : à 00:00, toute la journée `aujourd'hui + windowDays` devient réservable d'un coup.
Il n'existe aucun réglage permettant à un club d'ouvrir les nouvelles réservations à une
**heure précise** (ex. « les créneaux de J+7 s'ouvrent à 8h »), pratique courante dans les
clubs de padel/tennis.

## Objectif

Permettre à chaque club de configurer **comment et à quelle heure** une nouvelle journée
devient réservable, via :

- un **mode d'ouverture** (3 comportements au choix), unique par club ;
- deux **heures de release** (grand public / abonnés), pour aligner ou différencier les deux audiences.

Contrainte non négociable : **rétrocompatibilité totale**. Les clubs existants ne doivent
constater aucun changement de comportement après déploiement.

## Périmètre

### Inclus
- Nouveau modèle de données sur `Club` (1 enum + 3 colonnes).
- Helper pur de calcul du « dernier instant réservable » (point de vérité unique).
- Enforcement backend autoritatif (`holdSlot` / `assertMembershipAndWindow`).
- Réglages admin (service `updateClub`/`getAdminClub` + page `/admin/settings`).
- Affichage joueur cohérent (picker de jours + créneaux gatés dans `ClubReserve.tsx`).
- Tests backend (helper + service) et frontend (helper + composant).

### Hors scope (YAGNI)
- Pas d'override par terrain (`Resource`).
- Heures en **heures pleines (0–23)** uniquement, pas de minutes (cohérent avec `openHour`/`closeHour`).
- **Un seul mode par club** : le mode ne diffère pas entre public et abonnés ; seules les *heures* peuvent différer.
- Les réservations créées par un gestionnaire (`adminCreateReservation`) restent **hors fenêtre** (inchangé).

## Modèle de données (`Club`)

Nouvel enum Prisma :

```prisma
enum BookingReleaseMode {
  DAY_AT_HOUR    // toute la nouvelle journée s'ouvre à l'heure H
  ROLLING_SLOT   // chaque créneau s'ouvre exactement W jours avant SON horaire (H ignoré)
  WINDOW_SHIFT   // on peut réserver jusqu'à J+W à H:00 précises
}
```

Nouveaux champs sur `model Club` (migration **additive**, valeurs par défaut → backfill implicite) :

```prisma
bookingReleaseMode BookingReleaseMode @default(DAY_AT_HOUR) @map("booking_release_mode")
publicReleaseHour  Int                @default(0)          @map("public_release_hour")
memberReleaseHour  Int                @default(0)          @map("member_release_hour")
```

- `bookingReleaseMode` : un mode par club.
- `publicReleaseHour` / `memberReleaseHour` : entiers **0–23**. Régler les deux égaux =
  « pareil pour tous » ; différents = avantage abonnés (ex. abonnés 7h, public 9h).
- **Défaut = `DAY_AT_HOUR` + `0` + `0`** → reproduit exactement le comportement actuel
  (toute la journée s'ouvre à minuit). Aucun club existant ne change de comportement.

## Helper pur : point de vérité unique

Fonction sans effet de bord, testable isolément, **mirrorée à l'identique côté frontend** :

```
maxBookableInstant(now, windowDays W, mode, releaseHour H) : DateTime   // fuseau du club
```

Un créneau / une réservation démarrant à `startLocal` est autorisé **ssi
`startLocal <= maxBookableInstant`**.

| Mode | « Dernier instant réservable » |
|---|---|
| `DAY_AT_HOUR`  | `released = (now.hour >= H ? W : W - 1)`, **plancher 0** → **fin de journée** de `aujourd'hui + released` (`endOf('day')`) |
| `ROLLING_SLOT` | `now + W jours` (exact, `H` ignoré) — un créneau s'ouvre exactement W jours avant son horaire |
| `WINDOW_SHIFT` | `aujourd'hui.startOf('day') + W jours`, fixé à `H:00` |

Vérification de rétrocompat : `DAY_AT_HOUR` avec `H = 0` ⇒ `now.hour >= 0` toujours vrai ⇒
`released = W` ⇒ `endOf('day')` de `aujourd'hui + W` = formule actuelle. ✅

Cas limite `W = 0` (réservation le jour même uniquement) : le plancher 0 garantit que la
journée du jour reste ouverte quelle que soit `H` (l'heure de release ne gate pas le jour même,
puisqu'il n'y a pas de « journée lointaine » à ouvrir).

**Emplacement** : helper backend dans `reservation.service.ts` (ou un petit util dédié
`booking-window.ts`) ; helper frontend `frontend/lib/bookingWindow.ts` reprenant la même
formule (Luxon des deux côtés).

## Enforcement backend (autoritatif)

`reservation.service.ts` :

- `holdSlot` : ajouter `bookingReleaseMode, publicReleaseHour, memberReleaseHour` au `select`
  du `club` (à côté de `timezone, publicBookingDays, memberBookingDays`).
- `assertMembershipAndWindow` : remplacer le calcul inline de `maxDate` par un appel au helper
  avec :
  - `W = isSubscriber ? memberBookingDays : publicBookingDays`
  - `H = isSubscriber ? memberReleaseHour : publicReleaseHour`
  - `mode = club.bookingReleaseMode`
  - refus `startLocal > maxBookableInstant` → **erreur `BOOKING_TOO_FAR`** (inchangée).

C'est le seul point qui bloque réellement une réservation trop lointaine.

## Réglages admin

- `club.service.ts` :
  - `getAdminClub` (et le `select` exposant le club admin) : renvoyer les 3 nouveaux champs.
  - `updateClub` : accepter `bookingReleaseMode` (valeur d'enum validée) et
    `publicReleaseHour` / `memberReleaseHour` (`clamp(0, 23)`, même garde que `clamp` existant pour les jours).
- `frontend/lib/api.ts` : ajouter les 3 champs aux types `AdminClub` (et `ClubDetail`, cf. affichage joueur).
- `frontend/app/admin/settings/page.tsx`, carte **« Réservation à l'avance »** :
  - un `<select>` **Mode d'ouverture** (3 options, libellés explicites) ;
  - deux champs **heure** (Public / Abonnés), `0–23` ;
  - heures **grisées / désactivées si mode = `ROLLING_SLOT`** (non utilisées dans ce mode) ;
  - texte d'aide décrivant le comportement de chaque mode.

## Affichage joueur (UX cohérente)

- L'API club publique (`ClubDetail`) expose `bookingReleaseMode`, `publicReleaseHour`, `memberReleaseHour`.
- `frontend/lib/bookingWindow.ts` : miroir de la formule backend → renvoie le `maxBookableInstant`.
- `frontend/components/ClubReserve.tsx` :
  - le sélecteur de jours n'affiche/active que les jours dont le début `<= maxBookableInstant`
    (remplace `nextDays(windowDays + 1)`) ;
  - les créneaux dont `startTime > maxBookableInstant` passent **indisponibles** (gère les
    journées lointaines **partiellement** ouvertes en `ROLLING_SLOT` / `WINDOW_SHIFT`) ;
  - utilise l'heure correspondant à `isSub`.
- L'endpoint de disponibilités (`getAvailableSlots` / `getClubAvailability`) reste **anonyme et
  non gaté** : il ne connaît pas le statut abonné du visiteur. Le gating d'affichage se fait
  côté front (qui connaît `isSub`) ; le backend `holdSlot` reste l'autorité. C'est cohérent avec
  l'architecture actuelle, où le picker de jours borne déjà l'affichage et `holdSlot` enforce.

## Stratégie de tests (TDD)

**Backend**
- Tests unitaires du helper `maxBookableInstant` : les 3 modes × (avant / après `H`) × cas
  limite `W = 0` ; vérif explicite que `DAY_AT_HOUR` + `H = 0` == comportement legacy.
- Tests `reservation.service` : `BOOKING_TOO_FAR` (ou succès) selon mode + heure + statut
  abonné vs public, autour de l'instant frontière.

**Frontend**
- Tests `lib/bookingWindow` (mêmes cas que le helper backend).
- Test `ClubReserve` : jours et créneaux correctement gatés selon mode / heure / `isSub`.

## Risques & points d'attention

- **Duplication de la formule** backend/frontend : risque de divergence. Mitigation : helper
  pur des deux côtés + jeux de tests identiques ; toute évolution de règle touche les deux.
- **Fuseau horaire** : tous les calculs se font dans `club.timezone` via Luxon (déjà le cas).
- **Migration** : purement additive (colonnes avec défaut), pas de downtime, pas de backfill explicite.
