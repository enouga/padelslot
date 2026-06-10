# Calendrier dans « Mes réservations » + déplacement de réservation

## Contexte

La page « Mes réservations » (`frontend/app/me/reservations/page.tsx`) n'affiche qu'une liste de cartes (onglets À venir / Passées) et ne montre pas les inscriptions tournois. L'utilisateur veut une **vue calendrier moderne** regroupant réservations de terrain ET tournois, avec **édition des entrées** : annuler une réservation, gérer une inscription tournoi, et **déplacer une réservation** (nouvelle capacité backend).

Design validé en brainstorming (maquettes navigateur, style **A — mois + détail du jour**) :
- Troisième onglet **« Calendrier »** dans le Segmented existant de `/me/reservations`.
- Grille mensuelle lun→dim, navigation ‹ ›, aujourd'hui surligné. Pastilles **bleu marque** (`ACCENTS.blue`) = réservations, **barre abricot continue** (`th.accentWarm`) = tournois multi-jours (startTime→endTime, 1 jour si endTime null). Passé atténué, annulé masqué. Légende.
- **Panneau du jour** sous la grille au clic : carte réservation (boutons *Déplacer* + *Annuler* via ConfirmDialog existant), carte tournoi (bouton *Gérer* → `/tournois/[id]`, où annulation/changement de coéquipier existent déjà). Jour vide → « Rien ce jour-là » + bouton Réserver.
- **Déplacement** : « Déplacer » ouvre `/reserver?move=<id>` — page Réserver en mode déplacement (bandeau abricot + Abandonner) ; la confirmation appelle un **nouvel endpoint atomique** `POST /api/reservations/:id/reschedule`.
- **Lecture** : fusion côté client de `GET /api/me/reservations` + `GET /api/me/tournaments` (existants) — aucun nouvel endpoint de lecture.

Maquettes persistées dans `.superpowers/brainstorm/17479-1781111355/content/` (calendar-layout.html, design-final.html).

## Étape 0 — Spec (convention projet)

Écrire la spec validée dans `docs/superpowers/specs/2026-06-10-calendrier-mes-reservations-design.md` (reprendre le design ci-dessus) et la commiter, comme pour les features précédentes (cf. CLAUDE.md). Ajouter `.superpowers/` au `.gitignore` s'il n'y est pas.

## Étape 1 — Backend : `rescheduleReservation` (TDD)

**`backend/src/services/reservation.service.ts`** — nouvelle méthode `rescheduleReservation(reservationId, userId, { resourceId, startTime, duration })`. Un seul POST, pas de hold/confirm en deux temps : la transaction crée directement la nouvelle résa `CONFIRMED` et annule l'ancienne. Réutiliser la mécanique existante : `this.lockKey()` (l.19), `assertMembershipAndWindow()` (l.29), `effectiveRate()` (pricing), `SSEService.getInstance().broadcast()`.

Logique :
1. Charger l'ancienne résa (+ `resource.clubId`) : `RESERVATION_NOT_FOUND` / `UNAUTHORIZED` (autre user) / `RESERVATION_NOT_ACTIVE` (ni PENDING ni CONFIRMED) / `RESERVATION_IN_PAST`.
2. Valider `duration` (multiple de 30 > 0) ; ressource cible : `RESOURCE_NOT_FOUND`, `CLUB_MISMATCH` si autre club.
3. **Heures ouvrées** en heure locale du club via Luxon (`openHour`/`closeHour`) → `OUT_OF_HOURS` (absent de holdSlot car le client envoie ici un créneau arbitraire ; le re-vérifier explicitement).
4. `assertMembershipAndWindow(resource, userId, startTime)` (fenêtre + membership).
5. Verrou Redis SET NX sur le **nouveau** créneau — **sauf si la clé est identique** à celle de l'ancienne résa (`sameKey` : changement de durée seule), sinon le NX échouerait contre soi-même. Échec → `SLOT_ALREADY_HELD`.
6. Prix : `effectiveRate(peakHours, weekday local, hour local, pricePerHour, offPeakPricePerHour)` × durée → `Prisma.Decimal`.
7. Transaction `Serializable` (+ timeout 10 s) : `SELECT … FOR UPDATE` sur l'ancienne ligne (re-check statut actif), comptage des conflits sur le nouveau créneau **avec `id: { not: reservationId }`** (point clé : permet de déplacer vers un créneau qui chevauche l'ancien) — `CONFIRMED` ou `PENDING` < 10 min, chevauchement `startTime < end && endTime > start` → `SLOT_NOT_AVAILABLE` ; `create` nouvelle résa CONFIRMED ; `update` ancienne → CANCELLED + `cancelledAt`.
8. Après commit : `redis.del` des deux locks, broadcast `slot_released` (ancien resourceId) puis `slot_confirmed` (nouveau). Dans le `catch` : `redis.del(newLock)` seulement si `!sameKey` — **toute erreur laisse l'ancienne résa intacte**.

**`backend/src/routes/reservations.ts`** — `POST /:id/reschedule` derrière `authMiddleware`, body `{ resourceId, startTime, duration }`, 400 si manquant. Compléter le mapping d'erreurs : `RESERVATION_NOT_ACTIVE`/`RESERVATION_IN_PAST`/`OUT_OF_HOURS` → 409, `RESOURCE_NOT_FOUND` → 404, `CLUB_MISMATCH` → 403.

**Tests** (`backend/src/services/__tests__/reservation.service.test.ts`, patterns existants : prismaMock/redisMock, `$transaction` → `cb(prismaMock)`, `$queryRaw` mocké pour FOR UPDATE) : happy path (création + annulation + 2 dels + 2 broadcasts) ; `id: { not: … }` dans le count (auto-chevauchement OK) ; `SLOT_NOT_AVAILABLE` → ancienne intacte + del newLock ; `SLOT_ALREADY_HELD` (SET NX null) ; cas `sameKey` (SET non appelé) ; gardes (not found, unauthorized, not active, in past, club mismatch, out of hours, fenêtre) ; tarif heures creuses appliqué.

Pas de migration Prisma (aucun champ nouveau).

## Étape 2 — Client API

**`frontend/lib/api.ts`** : ajouter `rescheduleReservation(id, { resourceId, startTime, duration }, token)` → `POST /api/reservations/:id/reschedule`. Les types `MyReservation` (l.266) et `MyTournamentRegistration` (avec `tournament.club.timezone`, `endTime: string|null`) existent déjà.

## Étape 3 — `frontend/lib/calendar.ts` (logique pure + tests)

Calqué sur `frontend/lib/clubhouse.ts` (helpers purs testés). Pas de date-fns — `Intl.DateTimeFormat` uniquement. Fonctions :
- `dayKeyInTz(iso, tz)` : clé `YYYY-MM-DD` dans le fuseau donné (`Intl 'en-CA'`). **Chaque entrée utilise le fuseau de SON club** (entrées multi-clubs possibles) ; la conversion instant→jour ne se fait qu'une fois ici, toute l'arithmétique ensuite est en clés UTC pures (anti-bugs DST).
- `todayKey(now)` (fuseau navigateur, pour « aujourd'hui »), `monthGrid(year, month)` (semaines lun→dim, arithmétique `Date.UTC`/`getUTCDay`, cellules hors-mois incluses), `addMonths`, `monthLabel` (fr-FR), `enumerateDayKeys(startKey, endKey)` (boucle +86 400 000 ms en UTC, cap 62 jours).
- `buildCalendarEntries(reservations, regs, now)` → `CalendarEntry[]` (union discriminée `kind: 'reservation' | 'tournament'`) : masque résas CANCELLED et inscriptions/tournois CANCELLED ; tournoi : `startKey/endKey` dans `reg.tournament.club.timezone`, `dayKeys = enumerateDayKeys(...)` ; flag `past`.
- `entriesByDay(entries)` → `Map<dayKey, CalendarEntry[]>` (tournoi présent sur chaque jour de son intervalle ; tri : tournois d'abord puis startTime).

**`frontend/__tests__/calendar.test.ts`** : monthGrid (juin 2026 commence lundi ; nov. 2026 → 6 jours de lead), dayKeyInTz (23h30Z → jour suivant en Europe/Paris), endTime null → 1 jour, tournoi 3 jours présent sur ses 3 jours, masquage CANCELLED, addMonths aux bornes d'année, enumerateDayKeys à travers le changement d'heure de mars.

## Étape 4 — Composants calendrier + tests

**`frontend/components/calendar/MonthCalendar.tsx`** : props `{ year, month, byDay, selected, todayKey, onSelect, onNavigate }`. En-tête `monthLabel` + chevrons (boutons ronds 38px style `atoms.tsx`), ligne L M M J V S D, grille CSS 7 colonnes de `<button>`. Aujourd'hui : anneau accent (`data-today` pour les tests) ; sélection : fond navy/surface. Pastilles résa 5px en **`ACCENTS.blue`** (constante de marque — PAS `th.accent`, surchargé par la couleur du club), max 3 + « +n ». Barre tournoi 4px `th.accentWarm` en bas de cellule, continue : arrondi gauche seulement sur `startKey`, droit seulement sur `endKey`, pleine largeur sur les jours intermédiaires. Entrées `past` → opacité 0.4.

**`frontend/components/calendar/DayPanel.tsx`** : props `{ dayKey, entries, canMove, onMove, onCancel, reserveHref, reserveLabel }`. Carte résa = style des cartes existantes de la page (bloc date + nom + Chip statut + fmtHour + prix) + boutons *Déplacer* (ghost) / *Annuler* (style `#ff7a4d` existant) si à venir. Carte tournoi : nom + Chip catégorie/genre + dates (`fmtDate`, fuseau du club du tournoi) + statut CONFIRMED/WAITLISTED + `<Link>` *Gérer* → `/tournois/${id}`. Jour vide : message + `Btn` Réserver.

**Tests** `MonthCalendar.test.tsx` (pastilles, barre tournoi, onSelect, onNavigate, today) et `DayPanel.test.tsx` (callbacks, Déplacer masqué si `canMove` false, lien tournoi, jour vide) — pattern `render(<ThemeProvider>…)` comme `CourtCalendar.test.tsx`.

## Étape 5 — Intégration page Mes réservations

**`frontend/app/me/reservations/page.tsx`** :
1. Segmented → `'upcoming' | 'past' | 'calendar'`.
2. `load()` : `Promise.all([api.getMyReservations(t), api.getMyTournaments(t)])` ; échec tournois toléré (catch → `[]`).
3. États `ym {year, month}` (init aujourd'hui) + `selectedDay` (init `todayKey()`) ; `useMemo` pour `buildCalendarEntries` + `entriesByDay`.
4. Onglet calendrier : `<MonthCalendar/>` + `<DayPanel/>`.
5. `onCancel` → réutilise tel quel le ConfirmDialog + `api.cancelReservation` existants ; `onMove={(r) => router.push('/reserver?move=' + r.id)}` avec `canMove = slug présent && r.resource.club.slug === slug && futur && non annulée` (sur l'hôte plateforme sans slug, masquer Déplacer ; même garde pour Gérer/Réserver).

**Test** `MyReservationsCalendar.test.tsx` : mocks api + navigation ; l'onglet affiche la grille ; Annuler ouvre le ConfirmDialog.

## Étape 6 — Mode déplacement (même lot que l'étape 5)

**`frontend/components/ClubReserve.tsx`** : le deep-link existant lit `window.location.search` en `useEffect` (pattern maison — le garder, PAS `useSearchParams` qui exigerait un Suspense boundary). Ajouter `?move=` :
- `moveRes` state ; effet dépendant du token : `api.getMyReservations(token)` → `find(id)` ; valider (club courant, future, non annulée) sinon ignorer ; pré-sélectionner `date` (via `dayKeyInTz`) et `duration` si dans les durées proposées.
- Bandeau abricot (`th.accentWarm` + `inkOn()`) entre ClubNav et DateSelector : « Déplacement : {terrain} · {date} · {heures} » + bouton **Abandonner** (clear state + `router.replace('/reserver')`).
- Passer `moveReservationId` à BookingModal ; à la confirmation : clear + `router.replace('/reserver')` + bannière « Réservation déplacée ! » + `loadAvail()`.

**`frontend/components/BookingModal.tsx`** : prop optionnelle `moveReservationId`. En mode move : pas de phase hold/pending (pas de ProgressRing ni TTL 10 min) — bouton « Déplacer ici » → `api.rescheduleReservation(...)` direct ; la fermeture n'appelle **jamais** `cancelReservation` (aucun hold posé, l'ancienne résa doit rester intacte) ; texte d'info « Votre réservation du … sera annulée et remplacée par ce créneau » ; mapping erreurs (`SLOT_NOT_AVAILABLE`/`SLOT_ALREADY_HELD` → « créneau pris », `RESERVATION_NOT_ACTIVE`/`IN_PAST` → « ne peut plus être déplacée », `OUT_OF_HOURS`).

**Tests** : `ClubReserve.move.test.tsx` (bandeau + date pré-sélectionnée, Abandonner, id invalide ignoré — imiter `ClubReserve.deeplink.test.tsx`) et `BookingModal.move.test.tsx` (appelle reschedule et jamais hold/confirm/cancel).

## Ordre

1 (backend, TDD) et 3 (lib calendar) parallélisables → 2 → 4 → 5+6 ensemble → vérification.

## Points de vigilance

- **Échec reschedule = ancienne résa intacte** (rollback transaction ; seul newLock nettoyé en catch).
- Lock Redis : clé = `resourceId + startTime ISO` → seul le cas « même départ, durée différente » nécessite la garde `sameKey` ; l'auto-chevauchement SQL est géré par `id: { not: … }`.
- Fuseaux : uniquement `dayKeyInTz` avec le fuseau du club de chaque entrée, puis arithmétique UTC pure.
- Couleurs : `ACCENTS.blue` pour les résas, `th.accentWarm` pour les tournois, `inkOn()` pour le texte sur abricot.
- Prisma 7 : adapter PrismaPg déjà en place, ne rien changer ; Next 16 : pas de `useSearchParams`, pas de next-pwa.

## Vérification

1. `cd backend && npm test` puis `cd frontend && npm test` — tout vert.
2. Manuel : démarrer Docker (`docker-compose-v1.exe up -d`), backend + frontend, se connecter `test@palova.fr`/`password123`. Dans Mes réservations → onglet Calendrier : vérifier pastilles/barres, navigation mois, panneau du jour, jour vide. Annuler une résa depuis le panneau (ConfirmDialog → disparaît + SSE `slot_released` visible sur /reserver dans un autre onglet). Déplacer : bandeau sur /reserver, choisir un créneau chevauchant l'ancien (doit marcher), confirmer → ancienne annulée, nouvelle confirmée, prix recalculé (tester un créneau heures creuses sur court-3). Abandonner → rien ne change. Inscription tournoi visible en barre abricot multi-jours → Gérer ouvre `/tournois/[id]`.
3. `curl -X POST http://localhost:3001/api/reservations/<id>/reschedule` sans token → 401.
