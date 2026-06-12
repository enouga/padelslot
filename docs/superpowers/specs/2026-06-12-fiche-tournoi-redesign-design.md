# Redesign de la fiche tournoi `/tournois/[id]` — spec

**Date** : 2026-06-12 · **Statut** : implémenté

## Problème

La fiche tournoi (capture `inscriptions_tournoi.png`) était fonctionnelle mais visuellement brute : méta-infos en lignes plates, liste des inscrits numérotée, aucun signal d'urgence, pas de partage. Objectif : une page premium sans toucher à la logique métier (états, inscriptions, erreurs).

## Décisions (validées avec l'utilisateur)

1. **Hero immersif** — bandeau dégradé chaud (apricot → coral ; dégradé coral en tête quand l'urgence est avérée), grande typo display, pastilles catégorie/genre en couleurs fixes (pas `Chip`, illisible sur dégradé en mode clair), badge compte à rebours, jauge de remplissage animée, badge places restantes (`tournamentPlacesLabel` réutilisé de `lib/clubhouse.ts`).
2. **Urgence** — compte à rebours avant `registrationDeadline` (`J-x` ≥ 48 h ; « Plus que x h » < 48 h ; « Plus que x min » < 1 h, urgents) ; jauge `confirmedCount/maxTeams`.
3. **Cartes binômes avec avatars** — la liste des inscrits devient une grille de cartes : 2 avatars chevauchés (photo via `User.avatarUrl` désormais exposé par `listParticipants`, sinon initiales), n° d'équipe, badge « Attente · n°X » (position = ordre du tableau, garanti par l'orderBy backend), surlignage « Votre équipe ».
4. **Partage + calendrier** — Web Share API avec repli copie de lien (« Lien copié ! » 2 s), export `.ics` généré côté client (UTC, RFC 5545, pliage de lignes, DTEND = début + 2 h si pas d'heure de fin).
5. **Timeline** — stepper Inscriptions ouvertes → Clôture → Début, prochaine échéance en « current ».
6. **Position en liste d'attente** affichée aussi sur la carte « mon inscription ».

## Architecture

- **Backend (additif)** : `listParticipants` sélectionne aussi `avatarUrl` (aucune migration).
- **Helpers purs** `frontend/lib/tournament.ts` : `deadlineCountdown`, `fillRatio`, `waitlistPosition`, `timelineSteps`, `buildTournamentICS`, `icsFilename`, `formatDateTime`/`formatDateShort` — tous paramétrés par `now` (testabilité + hydration).
- **Composants** `frontend/components/tournament/` : `TournamentHero` (+ `MetaCards`), `TournamentTimeline`, `TeamsGrid`, `ShareActions`, et extraction sans changement de `ProfileCompletion`, `PartnerSearch`, `MyRegistrationCard` depuis la page. Nouveau `components/ui/Avatar.tsx` (pattern ProfileMenu factorisé) et icônes `share`/`download` dans `Icon.tsx`.
- **Page** : conserve états et handlers à l'identique ; horloge unique `now` (null au 1er rendu, 1er tick via `setTimeout` 0, puis interval 60 s) — jamais de `new Date()` au rendu pour le hero/timeline.

## Extension (même jour) — liste `/events` + fiche `/events/[id]`

Même langage visuel appliqué aux events :
- **Liste `/events`** : cartes `AgendaCard` (`components/agenda/AgendaCard.tsx`) — tuile icône teintée (trophy/apricot compétitions, bolt/cyan animations), chip compte à rebours (coral si urgent), mini-jauge de remplissage, prix / « Membres », chevron. Horloge `now` même pattern.
- **Fiche event** : hero `AgendaHero` + `MetaCardsRow` (briques extraites de la fiche tournoi dans `components/agenda/AgendaHero.tsx` ; `TournamentHero`/`MetaCards` en sont des habillages), partage + .ics (`buildTournamentICS` généralisé en `buildAgendaICS(…, uidPrefix)` ; `ShareActions` prend `item` + `uidPrefix`), timeline réutilisée telle quelle, **liste publique des inscrits** individuelle (`components/event/ParticipantsGrid.tsx`, avatar + position d'attente + « Vous »), position d'attente du joueur sur sa carte.
- **Backend additif** : `EventService.listParticipants` + route publique `GET /api/events/:id/participants` (noms + avatarUrl, jamais l'e-mail, DRAFT masqué, tri status puis createdAt).
- Logique métier des deux pages inchangée (register/cancel, memberOnly, messages d'erreur).

## Extension (même jour) — offres partenaires du Club-house

- **Modèle** : `Sponsor.offerUntil DateTime?` (saisie admin `YYYY-MM-DD`, stockée fin de journée UTC — tolérance fuseau assumée) + `Sponsor.pinned Boolean` (migration `add_sponsor_offer_until_pinned`). `listPublic` trie `pinned desc, sortOrder asc`.
- **Section Club-house** (`PartnerOffers.tsx`, prop `now` hydration-safe) : carte « Partenaire à la une » sur le dégradé signature (logo sur tuile blanche, offre en grande typo display, chip « Expire J-x » coral si urgent), grille d'offres actives 2 colonnes ≥ 600 px, cartes entièrement cliquables vers `linkUrl` (bouton code promo copiable en sibling hors de l'ancre — pas de `<button>` dans `<a>`), offres expirées/absentes en rangée « Ils soutiennent le club » (logos seuls). Helper pur `offerIsActive(s, now)` dans `lib/clubhouse.ts`.
- **Admin** : champ date « Offre valable jusqu'au » + case « À la une » dans `/admin/sponsors`, chip et date dans la table.

## Hors scope (plus tard)

CTA sticky mobile ; migration de ProfileMenu vers `Avatar` ; paiement en ligne de `entryFee` ; notifications e-mail.

## Tests

`frontend/__tests__/{tournament,TournamentHero,TeamsGrid,ShareActions}.test.{ts,tsx}` + extension de `backend/src/services/__tests__/tournament.service.test.ts`. Pièges couverts : `now=null` → pas de countdown et jauge à 0 ; `navigator.share`/`clipboard`/`URL.createObjectURL` absents de jsdom (stubs) ; tout mock de `lib/api` expose `assetUrl`.
