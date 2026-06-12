# Design — Installation PWA avec identité par club

> Statut : **implémenté** (2026-06-12).
> Décisions prises avec l'utilisateur : point d'entrée dans le **menu profil seul**, **icône par club complète en v1** (manifest dynamique + redimensionnement backend), pas de service worker.

## Objectif

Permettre d'installer Palova comme web app (icône écran d'accueil / bureau). Sur un sous-domaine club, l'app installée porte le **nom, la couleur et le logo du club** ; sur la plateforme (ou en repli), l'identité Palova.

## État des lieux (constaté le 2026-06-12)

- `frontend/public/manifest.json` existe mais est **cassé** : il déclare `/icon-192.png` et `/icon-512.png` qui n'existent pas (→ app non installable), `start_url: "/courts"` obsolète, `theme_color` vert périmé.
- Icônes SVG de marque disponibles dans `public/` (`palova-icon-*.svg`, `palova-mark-*.svg`) ; aucun PNG aux tailles requises ; apple-touch-icon déclaré en SVG (non supporté par iOS).
- `proxy.ts` exclut déjà les chemins à point (`.*\..*`) de son matcher → un manifest `/manifest.webmanifest` est servi sans redirection login.
- **Pas de service worker nécessaire** : Chrome/Edge n'exigent plus de SW pour l'installabilité (manifest valide + icônes + HTTPS) ; `beforeinstallprompt` se déclenche sans SW ; iOS ne l'a jamais exigé. `next-pwa` reste **inactif** (contrainte Turbopack, cf. CLAUDE.md).
- Backend Docker = `node:22-bookworm` (Debian/glibc) → `sharp` s'installe via binaires précompilés, pas de souci Alpine.

## 1. Fondations d'installabilité

- **Icônes Palova statiques** générées une fois depuis les SVG existants et **committées** dans `frontend/public/` : `icon-192.png`, `icon-512.png`, `icon-maskable-192.png`, `icon-maskable-512.png` (pictogramme à ~65 % sur fond plein, zone de sécurité Android), `apple-touch-icon.png` (180×180). Script de génération (sharp) conservé dans `scripts/`.
- **`frontend/app/manifest.ts`** (convention Next, Route Handler spécial — devient dynamique par requête dès qu'il lit `headers()`, vérifié dans la doc Next locale) :
  - lit le header `host`, résout le slug via `clubSlugFromHost` **extrait de `proxy.ts` vers `lib/host.ts`** (fonction pure réimportée par le proxy — comportement inchangé) ;
  - hôte plateforme → manifest Palova ; hôte club → fetch public du club puis manifest club ;
  - contenu club : `name`/`short_name` = nom du club (short_name tronqué ~12 caractères), `start_url: '/'`, `display: 'standalone'`, `theme_color` = `club.accentColor`, icônes = endpoint backend si `logoUrl`, sinon icônes Palova ;
  - la construction est une **fonction pure** `lib/manifest.ts` (`buildManifest(club | null)`) testable sans Next.
- **Suppression** de `public/manifest.json` et de `manifest: '/manifest.json'` dans `metadata` (Next injecte le `<link rel="manifest">` automatiquement pour `app/manifest.ts`).

## 2. Icônes club côté backend

- Nouvelle dépendance **`sharp`**.
- Route **publique** `GET /api/clubs/:slug/icon/:variant.png`, `variant ∈ {192, 512, maskable-192, maskable-512, apple-180}`.
- Traitement : téléchargement de `club.logoUrl` (timeout 5 s), recadrage **contain** en carré sur fond `accentColor` (jamais de logo tronqué) ; variantes maskable : logo réduit à ~65 %. Sortie PNG.
- **Cache disque** `uploads/icons/<clubId>-<variant>-<hash(logoUrl)>.png` (même volume prod `backend_uploads` que les avatars) ; le hash de l'URL invalide naturellement le cache quand le logo change. `Cache-Control` long (ex. 24 h).
- **Tout échec → fallback silencieux** sur l'icône Palova équivalente (logo absent, URL morte, timeout, format illisible) : le manifest reste toujours valide. Les PNG Palova de repli sont embarqués côté backend (copiés dans `src/assets/` ou équivalent).
- **Apple-touch-icon par club** : `app/layout.tsx` passe de `export const metadata` à `generateMetadata()` (le slug est déjà lu via `x-club-slug`) — icône apple = endpoint backend `apple-180` sur un hôte club avec logo, sinon `/apple-touch-icon.png`.

## 3. UX d'installation (menu profil seul)

- **`lib/install.ts`** — helpers purs : détection iOS Safari (UA), détection « déjà installée » (`display-mode: standalone` + `navigator.standalone`), machine d'état → `'native' | 'ios-manual' | 'hidden'`.
- **`lib/useInstallPrompt.ts`** — hook : capture `beforeinstallprompt` (`preventDefault` + stockage du prompt différé), écoute `appinstalled`, expose `{ state, promptInstall }`.
- **`ProfileMenu`** — entrée « Installer l'application » visible seulement si `state !== 'hidden'` :
  - `'native'` → `promptInstall()` (prompt du navigateur) ;
  - `'ios-manual'` → petite modale tutoriel : « Partager → Sur l'écran d'accueil » (3 lignes) ;
  - après `appinstalled` (ou en mode standalone), l'entrée disparaît.
- Rien n'est montré hors connexion (ProfileMenu ne rend rien sans session — assumé en v1).

## 4. Tests

- **Front** : unit `lib/install.ts` (UA, états) et `lib/manifest.ts` (club → manifest, fallbacks, troncature short_name) ; RTL `ProfileMenu` (entrée visible/cachée selon l'état, clic déclenche `prompt()`, iOS ouvre le tutoriel). ⚠️ mocks à identité stable (cf. note AdminLayout dans CLAUDE.md).
- **Back** : tests de route de l'endpoint icône — club sans logo → PNG Palova ; avec logo fixture **locale** → PNG carré à la bonne taille ; deuxième appel servi depuis le cache disque.

## 5. Hors périmètre v1

- Service worker, mode hors ligne, notifications push (contrainte Turbopack maintenue).
- Bannière d'invitation à l'installation (option écartée — pattern intrusif).
- Entrée d'installation pour les visiteurs non connectés.
- Purge proactive du cache d'icônes au changement de logo (le hash d'URL suffit).
- Capture d'écran (`screenshots`) du manifest pour l'UI d'install enrichie de Chrome.

## Risques assumés

- `sharp` entre dans l'image Docker backend (binaire natif, ~10 Mo) — OK sur bookworm.
- La qualité de l'icône installée dépend du logo saisi par le club : un logo basse résolution restera flou en 512 px (le fond `accentColor` rattrape seulement les proportions).
- `logoUrl` est une URL libre : le backend la télécharge côté serveur (SSRF limité : fetch GET image, timeout court, taille plafonnée — à borner dans l'implémentation, ex. 5 Mo max).
