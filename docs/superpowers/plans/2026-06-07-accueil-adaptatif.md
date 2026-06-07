# Accueil palova.fr adaptatif selon le rôle

## Context

Aujourd'hui l'accueil de la plateforme (`palova.fr`, c.-à-d. quand `useClub().slug === null`) affiche `components/PlatformLanding.tsx` : un hero marketing **statique** avec 3 boutons (« Trouver un club » → `/clubs`, « Se connecter » → `/login`, « Créer mon club » → `/clubs/new`). Il ne réagit **pas** à l'état de connexion ni au rôle. Résultat : un joueur déjà inscrit, un gérant de club et un visiteur voient exactement la même page.

But : faire de l'accueil une page **adaptative selon le rôle** :
- **Visiteur (non connecté)** : hero + **« Créer un compte »** (joueur) + **moteur de recherche de clubs intégré** + **« Créer mon club »**.
- **Joueur connecté** (sans club géré) : la **liste de ses clubs** (cartes) + le **moteur de recherche** intégré.
- **Gérant connecté** (≥1 club géré) : un écran minimal listant ses clubs gérés, avec un bouton **« Aller à l'admin de [Club] »** par club (décision produit : **pas** de redirection auto).
- **Super-admin** : hors périmètre (le login le route déjà vers `/superadmin`).

Seule la branche plateforme de `app/page.tsx` change. Les sous-domaines club (`<slug>.palova.fr`) continuent d'afficher `ClubHome` sans modification.

## Décisions produit (validées)
1. Gérant = **écran avec bouton(s)** par club géré (pas de redirection automatique, même avec un seul club).
2. Joueur/visiteur = **moteur de recherche intégré à l'accueil** ; on **extrait l'annuaire existant en composants partagés** (DRY avec `/clubs`).

## Détection du rôle (côté client, sans flash)
`useAuth()` → `{token, ready}`. `ready=false` au 1er rendu (cookies lus en `useEffect`).
- `!token` → vue **Visiteur**.
- `token` → appeler `api.getMyClubs(token)` (clubs **gérés**, comme `app/admin/layout.tsx:32`). Non vide → **Gérant** ; vide → **Joueur**.
- ⚠️ Ne **pas** se fier au cookie `clubId` pour le rôle (peut être absent/obsolète). Source de vérité = `getMyClubs`.
- Anti-flash : afficher un squelette thème-aware tant que `!ready` OU (token && getMyClubs non résolu).

---

## Étape 1 — Backend : rendre les clubs rejoints affichables en cartes

Le « mes clubs » du joueur s'appuie sur `getMyMemberships`, mais `GET /api/me/memberships` (`backend/src/routes/me.ts:27-35`) ne renvoie que `{clubId, slug, isSubscriber, status}` — **pas de nom/ville/logo**. On **enrichit** ce endpoint (additif, pas de nouvelle route).

**`backend/src/routes/me.ts`** — handler `/memberships` : étendre le `select` Prisma pour récupérer les champs d'affichage du club et renvoyer un objet `club` au **format `ClubSummary`** (mirroir de la projection de `backend/src/services/club.service.ts:57-79` : `clubSports.sport{key,name,icon}` + `_count.resources`). Réponse par adhésion :
```
{ clubId, slug, isSubscriber, status,
  club: { id, slug, name, city, description, accentColor, logoUrl, sports[], resourceCount } }
```
- Conserver `clubId / slug / isSubscriber / status` (consommés par `components/ClubHome.tsx:40` et `app/reserver/page.tsx:64` — ne lisent que `clubId`/`isSubscriber`).
- Filtrer sur `club.status === 'ACTIVE'` (ne pas afficher de carte vers un club suspendu/injoignable). NB : `status` de la réponse reste le statut **d'adhésion** (ACTIVE/BLOCKED), distinct de `club.status` (ACTIVE/SUSPENDED).
- Les clubs **non listés** (`listedInDirectory=false`) apparaissent ici (le joueur en est membre) — voulu ; l'annuaire public continue de les masquer.

**`backend/src/services/__tests__`** : globber un éventuel test de forme des memberships et l'adapter ; sinon rien.

## Étape 2 — `frontend/lib/api.ts` : types

1. **Corriger le bug latent** : l'interface `Membership` est déclarée **deux fois** (lignes ~238-243 et ~315-320) → TypeScript les fusionne, masquant les vraies formes. Les scinder :
   - `export interface ManagedClub { clubId; slug; name; role: 'OWNER'|'ADMIN'|'STAFF' }`
   - `export interface PlayerMembership { clubId; slug; isSubscriber: boolean; status: 'ACTIVE'|'BLOCKED'; club: ClubSummary }`
2. Retyper : `getMyClubs → ManagedClub[]`, `getMyMemberships → PlayerMembership[]`.
3. **Grep `frontend/` pour le type `Membership`** avant de renommer (les consommateurs passent par `api.*`, donc l'impact devrait être nul ; vérifier).

## Étape 3 — Extraire les composants partagés (DRY)

- **`frontend/components/ClubCard.tsx` (NOUVEAU)** : déplacer tel quel le `ClubCard` inline de `app/clubs/page.tsx:10-38`. Props `{ club: ClubSummary }`. Lien vers `clubUrl(club.slug)`. Sert à l'annuaire ET aux clubs du joueur (même forme `ClubSummary`).
- **`frontend/components/ClubDirectory.tsx` (NOUVEAU)** : déplacer la machine de recherche de `app/clubs/page.tsx` (états `q/city/sport`, debounce 200 ms, `api.listClubs` + `api.getSports`, helper `chipBtn`, grille de `ClubCard`, états « Chargement… » / « Aucun club ne correspond. »). **Embeddable** : ne rend que le bloc recherche (pas de `Screen` ni de titre de page), pour être posé sur `/clubs` comme sur l'accueil.
- **Refactor `frontend/app/clubs/page.tsx`** : supprimer le `ClubCard`/recherche inline, garder le `Screen` + l'en-tête + le titre « Trouvez votre club. », rendre `<ClubDirectory />`. Rendu identique (refactor pur).

## Étape 4 — `frontend/components/PlatformLanding.tsx` : réécriture adaptative

Dispatcher + squelette + 3 sous-vues (même fichier ou dossier `components/platform/`).

- **Dispatcher** : logique de détection ci-dessus ; rend `<PlatformSkeleton/>` (centré, thème-aware, en-tête Logotype+ThemeToggle, motif « Chargement… » de `app/page.tsx:11-12`) tant que le rôle n'est pas résolu, puis `AnonymousView` / `PlayerView` / `ManagerView`.
- **`AnonymousView`** : réutiliser le hero existant (`PlatformLanding.tsx:16-66`) ; CTA primaire `Btn full icon="user"` → `/register` (« Créer un compte ») ; garder « Se connecter » → `/login` et le lien « Créer mon club » → `/clubs/new` ; section « Parcourir les clubs » + `<ClubDirectory/>`. Abandonner le `minHeight:100vh` + `marginTop:'auto'` pour que l'annuaire défile sous le hero.
- **`PlayerView({ token })`** : `api.getMyMemberships(token)` ; en-tête Logotype + `MyBookingsButton` + `ThemeToggle` + `LogoutButton` (atoms auto-masqués sans token). Section « Mes clubs » = grille de `<ClubCard club={m.club} />` (état vide aimable si aucune adhésion) ; puis « Trouver un autre club » = `<ClubDirectory/>`.
- **`ManagerView({ clubs })`** : en-tête Logotype + ThemeToggle + LogoutButton ; titre « Vos clubs » ; pour chaque club géré, `Btn full icon="arrowR"` « Aller à l'admin de {c.name} » → `window.location.assign(clubUrl(c.slug, '/admin'))` (jamais `router.push` : cross-sous-domaine). Pas d'annuaire, pas de recherche, pas de redirection auto.

## Étape 5 — Super-admin (mineur)
Le login route déjà les super-admins vers `/superadmin`. Sur `/`, `getMyClubs` renvoie `[]` (ils ne sont pas `ClubMember`) → ils tombent dans `PlayerView`. Acceptable v1 ; juste un commentaire de code. Ne rien construire.

---

## Fichiers critiques
- `backend/src/routes/me.ts` (enrichir `/memberships`) ; réf. projection : `backend/src/services/club.service.ts:57-79`
- `frontend/lib/api.ts` (scinder `Membership` → `ManagedClub`/`PlayerMembership`, retyper)
- `frontend/components/ClubCard.tsx` (nouveau, extrait), `frontend/components/ClubDirectory.tsx` (nouveau, extrait)
- `frontend/app/clubs/page.tsx` (refactor pour utiliser les composants extraits)
- `frontend/components/PlatformLanding.tsx` (réécriture adaptative)

## Réutilisations existantes
- `clubUrl(slug, path)` (`frontend/lib/clubUrl.ts`) pour les liens cross-sous-domaine.
- `useAuth()` (`lib/useAuth.ts`), `api.getMyClubs/getMyMemberships/listClubs/getSports` (`lib/api.ts`).
- `Logotype`, `ThemeToggle`, `MyBookingsButton`, `LogoutButton`, `Btn`, `Chip`, `Screen`, `Icon`, `Placeholder` (`components/ui/*`).
- Projection `ClubSummary` de `club.service.ts` à recopier pour les memberships enrichis.

## Risques / points de vigilance
- Clubs membres **suspendus** masqués (carte morte) — comportement voulu.
- Renommage du type `Membership` = changement cassant → grep `frontend/` d'abord.
- **Flash** de mauvaise vue → gardé par `ready` + `getMyClubs` non résolu (squelette).
- `clubId` cookie non autoritatif pour le rôle → utiliser `getMyClubs`.
- Nav cross-sous-domaine via `clubUrl` + `window.location.assign` (pas `router.push`).

## Vérification (manuelle)
1. `"C:\Program Files\Docker\Docker\resources\bin\docker-compose-v1.exe" up -d`.
2. Backend (`backend/`) `npm run dev` (:3001). Après l'étape 1 : avec un token joueur, `curl -H "Authorization: Bearer <token>" http://localhost:3001/api/me/memberships` → chaque ligne a un `club` imbriqué avec `name/city/sports/resourceCount`.
3. Frontend (`frontend/`) `npm run dev` (:3000). Sur l'**hôte plateforme** `localhost:3000` (sans slug) :
   - **Visiteur** : hero + « Créer un compte » → `/register`, « Créer mon club » → `/clubs/new`, annuaire intégré (filtre nom/ville, chip sport ; cartes → `<slug>.localhost:3000`).
   - **Joueur** (`test@palova.fr`/`password123`) : sur `/` → « Mes clubs » + annuaire, aucun bouton admin.
   - **Gérant** (OWNER/ADMIN) : `/` → écran avec bouton(s) « Aller à l'admin de [Club] » → `<slug>.localhost:3000/admin` ; pas d'annuaire, pas de redirection auto.
   - **Anti-flash** : recharger `/` en gérant → squelette puis vue gérant, jamais la vue visiteur/joueur.
4. Non-régression : `<slug>.localhost:3000/` rend toujours `ClubHome` ; `/clubs` fonctionne (composants extraits) ; `/reserver` lit toujours `isSubscriber` via `getMyMemberships`.
5. Optionnel : `npm test` (front RTL + back Jest), ajuster un test de forme memberships s'il existe.
