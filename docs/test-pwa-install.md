# Tester l'installation PWA (icône web app)

> Fonctionnalité : manifest dynamique par hôte + icône par club + entrée « Installer l'application » dans le menu profil.
> Spec : `docs/superpowers/specs/2026-06-12-pwa-install-design.md`

## 0. Pré-requis

Les trois services lancés :

```bash
# 1. Postgres + Redis
"C:\Program Files\Docker\Docker\resources\bin\docker-compose-v1.exe" up -d
# 2. Backend (dossier backend/)
npm run dev
# 3. Frontend (dossier frontend/)
npm run dev
```

## 1. Vérifier les fondations (2 curl)

```bash
# Manifest plateforme → identité Palova
curl -s http://localhost:3000/manifest.webmanifest
# attendu : "name":"Palova", icônes /icon-192.png etc.

# Manifest club → identité du club
curl -s -H "Host: padel-arena-paris.localhost:3000" http://localhost:3000/manifest.webmanifest
# attendu : le nom du club, theme_color = sa couleur, icônes pointant vers
# http://localhost:3001/api/clubs/padel-arena-paris/icon/...

# Icône club générée depuis le logo
curl -s -o icone.png http://localhost:3001/api/clubs/padel-arena-paris/icon/192.png
# ouvrir icone.png : le logo du club posé sur un carré à sa couleur d'accent
```

## 2. Installation desktop (Chrome ou Edge — le test principal)

1. Ouvrir **`http://padel-arena-paris.localhost:3000`** dans Chrome (les sous-domaines de `localhost` marchent nativement, et `localhost` est considéré comme sécurisé — pas besoin de HTTPS).
2. Avant de cliquer : **DevTools → Application → Manifest**. On doit voir le nom du club, sa couleur, ses icônes, et la section *Installability* **sans erreur**. C'est le juge de paix — tout problème d'icône ou de manifest y est écrit en toutes lettres.
3. Se connecter, ouvrir le **menu profil** → l'entrée **« Installer l'application »** apparaît (Chrome émet `beforeinstallprompt` quelques secondes après le chargement ; si l'entrée manque, recharger la page et rouvrir le menu).
4. Cliquer → prompt natif de Chrome → **Installer**. L'app s'ouvre en fenêtre autonome (sans barre d'adresse) ; l'icône sur le bureau / menu Démarrer est **le logo du club** avec **son nom**.
5. Dans la fenêtre installée : menu profil → l'entrée a **disparu** (mode standalone détecté).
6. Refaire la même chose sur **`http://localhost:3000`** : on installe cette fois « Palova » avec l'icône Palova — les deux apps coexistent (origines différentes).

## 3. Tutoriel iOS (simulable en local)

Safari iOS n'a pas de prompt natif, donc on affiche un mode d'emploi :

1. DevTools → **émulation mobile** (icône téléphone) → choisir **iPhone**.
2. Recharger la page, se connecter, menu profil → « Installer l'application ».
3. Cliquer → au lieu du prompt, la **modale tutoriel** s'ouvre : « Partager → Sur l'écran d'accueil → Ajouter », bouton « Compris » pour fermer.

Le vrai test iOS (icône réellement posée, apple-touch-icon aux couleurs du club) ne peut se faire qu'en prod en HTTPS, depuis Safari sur un iPhone : Partager → « Sur l'écran d'accueil ».

## 4. Les cas de repli (robustesse)

- **Club sans logo** : dans `/admin/settings`, vider le champ logo → recharger → le manifest du club garde son nom mais bascule sur les icônes Palova. Remettre le logo ensuite.
- **Logo injoignable** : mettre une URL morte comme logo → `curl http://localhost:3001/api/clubs/<slug>/icon/192.png` doit quand même répondre `200 image/png` (PNG Palova de repli, jamais d'erreur dans le manifest).
- **Cache** : après le premier appel, un fichier apparaît dans `backend/uploads/icons/` (`<clubId>-<variant>-<hash>.png`). Les appels suivants ne retéléchargent pas le logo. Changer le logo du club → le hash change → nouvelle icône générée au prochain appel.
- **Variante inconnue** : `curl -s -o NUL -w "%{http_code}" http://localhost:3001/api/clubs/<slug>/icon/999.png` → `404`.

## 5. Navigateurs sans installation

Sur Firefox desktop (pas de `beforeinstallprompt`, pas iOS) : l'entrée du menu ne doit **jamais** apparaître. C'est le comportement voulu, pas un bug.

## Pièges connus

- Si l'app est **déjà installée**, Chrome n'émet plus `beforeinstallprompt` → désinstaller (menu ⋮ de la fenêtre installée → Désinstaller) pour retester.
- Après modification du logo, penser au cache navigateur (Ctrl+F5) : les icônes sont servies avec un `Cache-Control` de 24 h.
