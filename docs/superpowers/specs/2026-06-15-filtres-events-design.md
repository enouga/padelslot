# Filtres avancés de la page Events

Date : 2026-06-15

## Intention

La page `/events` n'a qu'un filtre de source (`Tout · Compétitions · Animations`).
Ajouter un filtrage **par type** : catégorie/genre des tournois, type/membres des
animations — en multi-sélection, avec une rangée secondaire **contextuelle** (Option A).

## UX

- **Rangée 1** (inchangée, sélection unique) : `Tout · Compétitions · Animations`.
  Pilotée par l'URL `?filtre=` comme aujourd'hui.
- **Rangée 2** (multi-sélection, contextuelle) :
  - **Compétitions** → Catégorie (P25→P2000) `|` Genre (Messieurs/Dames/Mixte)
  - **Animations** → Type (Mêlée/Stage/Soirée/Initiation/Événement) `|` toggle « Membres »
  - **Tout** → sous-ensemble combiné : Catégorie `|` Type (le « quoi » de chaque source ;
    genre et Membres restent réservés aux onglets dédiés)
- On n'affiche que les valeurs **présentes** dans les events chargés (jamais de pastille morte).
- Changer la rangée 1 **réinitialise** la rangée 2.
- Lien « Effacer » quand ≥ 1 filtre secondaire actif.
- Facettes secondaires **non** persistées dans l'URL (scope serré).

## Sémantique de filtrage

`EventFilterState = { source, categories: Set<string>, genders: Set<Gender>, kinds: Set<Kind>, memberOnly: boolean }`

- Source d'abord (comme `filterAgenda` aujourd'hui).
- Une facette ne contraint **que les items de sa source** ; les autres passent.
  - Tournoi : gardé si `(categories vide || cat ∈ categories) && (genders vide || gender ∈ genders)`.
  - Animation : gardée si `(kinds vide || kind ∈ kinds) && (!memberOnly || event.memberOnly)`.
- → En « Tout », sélectionner P500 filtre les tournois à P500 et **laisse passer** les animations
  (combinable avec un type d'animation). Multi intra-dimension = OU ; inter-dimensions = ET.

## Code

`frontend/lib/events.ts` (helpers purs, testés) :
- `CATEGORY_ORDER: string[]` — ladder P25→P2000, pour trier les facettes catégorie.
- `agendaFacets(items): { categories: string[]; genders: TournamentGender[]; kinds: ClubEventKind[]; hasMemberOnly: boolean }`
  — valeurs distinctes présentes, triées (catégories selon `CATEGORY_ORDER`, genres MEN/WOMEN/MIXED, kinds selon l'ordre de `KIND_LABEL`).
- `applyAgendaFilters(items, state): AgendaItem[]` — remplace l'usage direct de `filterAgenda`
  (qui reste pour la compat ; `applyAgendaFilters` l'appelle pour la source).

`frontend/app/events/page.tsx` :
- État `source` (existant) + `categories/genders/kinds/memberOnly`.
- Rangée 2 contextuelle calculée depuis `agendaFacets(mergeAgenda(...))` et la source.
- Toggle de pastille (ajout/retrait dans le Set), lien Effacer, reset au changement de source.
- Réutilise le style chip existant (accent rempli = actif) ; chips secondaires plus petites.

## Tests

`frontend/__tests__/events.test.ts` (ajouts) :
- `agendaFacets` : valeurs présentes seulement, tri catégorie/genre/kind, dédup, `hasMemberOnly`.
- `applyAgendaFilters` : OU intra-dimension, ET inter-dimensions, facette n'affecte que sa source,
  `memberOnly`, état vide = tout passe, combiné avec la source.

Pas de test RTL (cohérent avec l'absence de test sur cette page).

## Hors périmètre

- Persistance des facettes dans l'URL.
- Filtres transverses période/prix/disponibilité (extensibles plus tard, cf. Option C).
- Refonte du `CATEGORIES` du formulaire admin (on duplique l'ordre dans `lib/events.ts`,
  liste figée et connue).
