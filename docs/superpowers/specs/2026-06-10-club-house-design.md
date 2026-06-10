# Club-house — refonte de la page « Infos » (design)

**Date :** 2026-06-10
**Statut :** validé (brainstorming avec maquettes — variante « Magazine » choisie)

## Objectif

Transformer la page « Infos » (panneau d'affichage statique : annonces, réservations, logos partenaires) en page **« Club-house »** : le lieu de vie numérique du club, qui informe **et** génère du business pour le club (remplissage de créneaux, inscriptions tournois, visibilité monétisable des sponsors).

Positionnement : là où Playtomic est une marketplace centrée joueur multi-clubs, Palova donne à chaque club **sa** maison. La page Club-house en est la vitrine.

## Périmètre v1

Inclus :
1. Renommage « Infos » → « Club-house » (onglet + route).
2. Hero « À la une » (annonce épinglée mise en scène, avec image).
3. Bloc « À saisir aujourd'hui » (créneaux libres du jour, lien profond vers la réservation).
4. Bloc « Prochains tournois » (avec urgence des places et CTA inscription).
5. Offres partenaires (texte d'offre + code promo copiable).

Exclus (v2 potentielles) : tableau « cherche partenaire », pouls du club en temps réel (joueurs présents), photo de couverture / couleur d'accent par club, fenêtre multi-jours pour les créneaux.

## Structure de la page (ordre de lecture)

1. **À la une** — l'annonce **épinglée publiée la plus récente** en grand bandeau.
   - Fond : son `imageUrl` (champ existant, jamais affiché aujourd'hui) avec voile sombre pour la lisibilité ; sinon dégradé aux couleurs du thème.
   - Bouton « En savoir plus → » si `linkUrl` présent.
   - **Aucune annonce épinglée → pas de hero**, la page démarre à la grille.
2. **Grille action** — 2 colonnes ≥ 600 px, empilée sur mobile :
   - **À saisir aujourd'hui** : les **3 prochains créneaux libres du jour** (tous terrains confondus, postérieurs à maintenant, triés par heure), avec nom du terrain, heure et prix. Clic → lien profond réservation. **Bloc masqué si vide.**
   - **Prochains tournois** : les **2 prochains tournois publiés** (tri par `startTime`). Libellé places :
     - `maxTeams` défini et restant ≤ 5 → « Plus que X places » (accent rouge) ;
     - complet → « Complet · liste d'attente possible » ;
     - sinon → « N binômes inscrits ».
     Clic → `/tournois/[id]`. **Bloc masqué si aucun tournoi.**
3. **Vos prochaines réservations** — inchangé (3 prochaines, gestion/annulation, connecté seulement).
4. **Annonces** — les autres annonces publiées ; celle affichée en une n'est pas répétée.
5. **Offres partenaires** — par sponsor actif : logo + `offerText` + `offerCode` copiable en un clic (presse-papier, feedback « Copié ! ») ; lien externe si `linkUrl`. Sponsor sans offre → logo seul (affichage actuel).

## Données et API

**Aucune nouvelle route publique.** Cinq appels existants, en parallèle, indépendants (un échec masque son bloc, ne casse jamais la page) :

| Bloc | Source |
|---|---|
| Hero + annonces | `GET /api/clubs/:slug/announcements` |
| Tournois | `GET /api/clubs/:slug/tournaments` (compteurs `confirmedCount`/`waitlistCount` déjà inclus) |
| À saisir | `GET /api/clubs/:slug/availability?date=<aujourd'hui>&duration=<défaut club>` (même règle `defaultDuration` que `ClubReserve`) |
| Vos réservations | `GET /api/me/reservations` (si token) |
| Partenaires | `GET /api/clubs/:slug/sponsors` |

« Aujourd'hui » est calculé dans le fuseau du club (même convention UTC+2 que le reste de l'app en v1).

## Changement backend (le seul)

Modèle `Sponsor` : deux champs optionnels.

```prisma
offerText  String?   // ex. « −10 % sur les raquettes en boutique »
offerCode  String?   // ex. « TPC10 » — affiché copiable côté joueur
```

- Migration additive (`add_sponsor_offer`), aucun backfill nécessaire.
- Routes admin sponsors (création/mise à jour) : acceptent et valident ces champs (trim, vide → null).
- Route publique sponsors : renvoie les deux champs.
- Back-office club `/admin` : deux champs ajoutés au formulaire sponsor.

## Lien profond « Réserver »

Le CTA d'un créneau pointe vers `/reserver?resource=<resourceId>&start=<ISO>`.

`ClubReserve` (qui lit déjà `?tab=`) lit ces paramètres au montage :
- créneau encore libre dans les disponibilités chargées → pré-ouvre le panneau de confirmation (`booking`) sur ce créneau ;
- créneau pris entre-temps ou paramètres invalides → page de réservation normale, sans erreur bloquante.

## Frontend — découpage

- `app/club-house/page.tsx` : nouvelle route (garde contexte club, comme `/infos` actuel).
- `app/infos/page.tsx` : redirection vers `/club-house` (liens et habitudes conservés).
- `components/ClubHouse.tsx` : orchestrateur (remplace `ClubInfo.tsx`) — charge les données, distribue aux blocs.
- Petits composants ciblés, testables seuls : `HeroAnnouncement`, `SlotsAlaUne`, `TournamentsAlaUne`, `PartnerOffers`. « Vos réservations » et « Annonces » réutilisent l'existant de `ClubInfo`.
- `ClubNav` : onglet « Infos » → « Club-house » (icône maison), `match` sur `/club-house` (+ `/infos`).

## Gestion des erreurs

- Chaque bloc échoue en silence (pattern actuel de `ClubInfo`) : liste vide → bloc masqué.
- Copie presse-papier : `navigator.clipboard` avec repli silencieux (le code reste lisible et sélectionnable).
- Lien profond : jamais d'état bloquant ; au pire l'utilisateur voit la page de réservation standard.

## Tests

**Frontend (RTL) :**
- Hero : affiché avec annonce épinglée (titre, CTA si `linkUrl`) ; absent sinon (la page démarre à la grille) ; l'annonce en une n'apparaît pas en double dans la liste.
- À saisir : 3 créneaux max, masqué si vide.
- Tournois : les trois libellés de places (« Plus que X », « Complet… », « N binômes inscrits »).
- Offres : code copié dans le presse-papier (mock), feedback affiché ; sponsor sans offre → logo seul.
- `ClubNav` : libellé « Club-house », onglet actif sur `/club-house`.
- `/infos` : redirige vers `/club-house`.
- `ClubReserve` : parsing `?resource=&start=` → pré-ouverture du booking ; paramètres invalides → comportement normal.

**Backend (Jest) :**
- Sponsors : `offerText`/`offerCode` acceptés en création/mise à jour (trim, vide → null), renvoyés par la route publique.

## Références

- Maquettes : `.superpowers/brainstorm/985-1781099344/content/` (variante « Magazine » retenue : `clubhouse-detail.html`).
- Page actuelle : `frontend/app/infos/page.tsx` + `frontend/components/ClubInfo.tsx`.
