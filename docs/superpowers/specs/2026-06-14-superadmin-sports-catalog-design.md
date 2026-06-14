# Catalogue des sports (superadmin) — durées proposées & surfaces

**Date :** 2026-06-14
**Statut :** approuvé (design), à planifier
**Auteur :** Éric + Claude

## Objectif

Donner au **superadmin** une vraie gestion du **catalogue des sports** de la plateforme :
créer / modifier / supprimer un sport, en définissant ses **durées proposées** et ses
**surfaces (matériaux)**. Côté **club**, chaque terrain choisit son matériau dans la liste
du sport et porte un indicateur **« Couvert »** indépendant.

Exemple cible (Tennis) : sport `Tennis` avec matériaux `[Béton poreux, Résine]` ;
au club, 1 terrain « Béton poreux » et 4 terrains « Résine » dont 2 cochés « Couvert ».

## État actuel (rappel)

- `Sport` (catalogue) possède déjà : `key`, `name`, `resourceNoun`, `defaultSlotStepMin`,
  `defaultDurationsMin Int[]`, `icon`. **Aucun endpoint de création** — seul `GET /api/sports`
  existe. Le catalogue est seedé (6 sports).
- `ClubSport.durationsMin Int[]` override les durées par club. La page admin **club**
  (`app/admin/sports/page.tsx`) active un sport du catalogue et bascule ses durées, mais
  **limitée à `ALLOWED_DURATIONS = [45,60,90,120]`** en dur (`lib/duration.ts`).
- `Resource` (terrain) porte `attributes` JSON avec aujourd'hui `surface` = `indoor|outdoor`
  (liste figée `SURFACE_TYPES` dans `lib/courtType.ts`) et `format` = `double|single`.
  **Aucune notion de matériau.** L'axe « couvert » est confondu avec `indoor`.
- Superadmin : `app/superadmin/{layout,page,clubs}.tsx` + routeur `platform`
  (`/api/platform/*`, protégé `authMiddleware + requireSuperAdmin`) avec CRUD clubs.

## Modèle de données

### Schéma (migration additive)

- **`Sport.surfaces String[] @default([]) @map("surfaces")`** — liste des matériaux du sport.
  Une seule colonne ajoutée ; migration additive (même nature que les colonnes cutoff récentes).
- **Pas d'override par club** : un club « possède » un matériau dès qu'un de ses terrains
  l'utilise. Pas de `ClubSport.surfaces`.

### Terrain (`Resource.attributes`, JSON — pas de migration de schéma)

- `attributes.surface` : passe de `indoor|outdoor` au **matériau** (ex. `"Résine"`).
- `attributes.covered` : **nouveau booléen** (couvert / découvert).
- `attributes.format` : inchangé (`double|single`).

### Backfill des terrains existants (data migration, pas de schéma)

Script idempotent exécuté une fois (migration SQL `UPDATE` sur le JSON, ou script Node) :

- `covered = (attributes.surface === 'indoor')`.
- `surface` (matériau) remis à `null`/absent — `indoor/outdoor` n'était pas un matériau ;
  l'admin re-choisit. Données surtout de démo → acceptable.

## Backend

### Endpoints catalogue (routeur `platform`, `/api/platform/sports`)

| Méthode | Route | Rôle |
|---|---|---|
| `POST` | `/sports` | créer un sport |
| `PATCH` | `/sports/:id` | modifier (champs ci-dessous, sauf `key`) |
| `DELETE` | `/sports/:id` | supprimer — **bloqué** si ≥1 `ClubSport` référence le sport |

La **liste** réutilise `GET /api/sports` existant (déjà consommé par l'admin club et le booking).

**Champs créables / modifiables :** `name`, `icon`, `resourceNoun`
(`terrain|court|table|piste|baie`), `defaultSlotStepMin`, `defaultDurationsMin Int[]`,
`surfaces String[]`.

**`key`** (identifiant stable) : auto-dérivé du `name` à la création
(minuscules, accents retirés, espaces → tirets), modifiable dans le formulaire, unicité
vérifiée serveur. **Immuable en édition.**

**Validations :**
- `name` non vide ; `key` unique et non vide.
- `defaultDurationsMin` : ≥ 1 entier strictement positif.
- `defaultSlotStepMin` : entier > 0 (idéalement multiple de 15).
- `surfaces` : tableau de chaînes non vides, dédupliquées, trim. Peut être vide (sport sans
  matériau distinctif).
- `resourceNoun` ∈ liste autorisée.

**Erreurs mappées :** `SPORT_KEY_TAKEN` (409), `SPORT_IN_USE` (409, à la suppression),
`VALIDATION_ERROR` (400), `SPORT_NOT_FOUND` (404).

### Routes terrains (admin courts)

Le create/update d'un `Resource` accepte déjà `attributes`. Étendre pour porter
`covered` (booléen) et `surface` (matériau, chaîne libre validée contre les `surfaces`
du sport du terrain — ou acceptée telle quelle si la liste du sport est vide).

## Frontend — superadmin `app/superadmin/sports/page.tsx`

Calquée sur `superadmin/clubs` (même layout / nav). Lien ajouté dans la nav superadmin.

- **Liste** des sports : icône + nom + `resourceNoun` + durées + matériaux, avec
  **Modifier** / **Supprimer** (suppression désactivée + tooltip si `SPORT_IN_USE`).
- **Formulaire** (création et édition, composant réutilisé) :
  - `name`, `icon` (emoji), `resourceNoun` (select), `defaultSlotStepMin` (select).
  - **Durées proposées** : puces presets `30 / 45 / 60 / 90 / 120` (toggle) + champ
    « Autre… » numérique → puce retirable. Au moins une obligatoire.
  - **Surfaces (matériaux)** : champ texte « Ajouter un matériau » (ex. « Béton poreux »)
    → puces retirables. Liste éventuellement vide.
- Helpers API : `api.adminCreateSport`, `api.adminUpdateSport`, `api.adminDeleteSport`
  (scopés `/api/platform/sports`).

## Frontend — admin club (courts) `app/admin/courts/page.tsx`

- Le select **Surface** d'un terrain n'utilise plus `SURFACE_TYPES` (indoor/outdoor figé)
  mais les **`surfaces` du sport** du terrain (`clubSport.sport.surfaces`). Si la liste du
  sport est **vide → le champ matériau est masqué** (sport sans matériau distinctif) ;
  aucun `attributes.surface` n'est alors écrit. La case « Couvert » reste, elle, toujours
  présente.
- Nouvelle case **« Couvert »** par terrain (création + édition), écrite dans
  `attributes.covered`.
- Affichage (table + cartes booking) : badge **matériau** + pastille **couvert/découvert**.
  Adapter `courtType` / `SURFACE_TYPES` (`lib/courtType.ts`) : séparer l'axe « couvert »
  du matériau ; conserver un rendu propre quand le matériau est absent.

### Raccord durées côté club (inclus)

Dans `app/admin/sports/page.tsx`, les puces de durées ne sont plus bornées à
`ALLOWED_DURATIONS = [60,90,120]` : elles dérivent des **durées réelles du sport**
(union presets ∪ `sport.defaultDurationsMin`), pour que des durées 30/45 créées au catalogue
soient réglables côté club.

## Phasage

1. **Catalogue back** : migration `Sport.surfaces` + CRUD `/api/platform/sports` + validations.
2. **Catalogue front** : page superadmin sports (liste + formulaire durées & matériaux) + nav.
3. **Terrains** : `covered` + matériau dans `attributes` ; backfill ; admin courts (select
   matériau depuis le sport, case Couvert) ; affichage.
4. **Raccord durées club** (petit).

## Hors périmètre

- Réorganisation du booking au-delà de l'affichage matériau/couvert.
- Filtres de réservation par matériau/couvert (peut venir ensuite).
- Internationalisation des noms de matériaux (texte libre pour l'instant).
- Override des matériaux par club.

## Tests

- **Back** : création (clé auto + collision), validations durées/surfaces, suppression
  bloquée `SPORT_IN_USE`, PATCH n'altère pas `key`.
- **Front** : formulaire superadmin (ajout/retrait puces durées & matériaux) ; courts admin
  (select matériau alimenté par le sport, case Couvert persiste) ; raccord durées club.
- **Backfill** : terrain `indoor` → `covered:true`, `outdoor` → `covered:false`, matériau vidé.
