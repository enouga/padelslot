# Design — Toggle global de la sidebar admin

> Statut : **implémenté** (2026-06-12).
> Décisions prises avec l'utilisateur : masquage complet (pas de rail d'icônes), préférence **persistante**, bouton existant du Planning **conservé en doublon**.

## Objectif
Un bouton pour cacher/afficher la barre latérale de l'espace club (`/admin`), disponible sur **toutes** les pages admin — généralisation du mécanisme `AdminChromeContext` déjà en place (aujourd'hui seul le Planning replie la sidebar, et uniquement pour la page courante).

## Comportement
- Un bouton chevron (`⟨`) dans l'en-tête de la sidebar (à droite de l'identité club) la masque **entièrement** (l'aside disparaît, le contenu passe pleine largeur — comportement actuel de `collapsed`).
- Sidebar masquée : un petit bouton (`⟩`) reste visible, calé en haut à gauche du contenu (**sticky**, pour rester accessible en scrollant), et la ré-affiche.
- Le choix est **persistant** : clé localStorage `palova:admin-sidebar`, relue à l'initialisation du state. Il survit à la navigation entre pages admin et au rechargement.
- Pas de risque d'hydration mismatch : le layout affiche « Chargement… » (indépendant de `collapsed`) jusqu'à la vérification des droits, donc le premier rendu comparé par React ne dépend pas de la valeur lue.

## Implémentation (2 fichiers touchés)
- `frontend/app/admin/layout.tsx` :
  - init de `collapsed` depuis localStorage (initializer paresseux avec garde `typeof window`) ;
  - wrapper `setCollapsed` qui écrit dans localStorage à chaque toggle ;
  - bouton chevron dans l'aside (en-tête) ;
  - bouton de ré-affichage dans le `<main>` quand `collapsed` ;
  - `AdminChromeContext` garde sa signature (`{ collapsed, setCollapsed }`) — le Planning continue de marcher tel quel.
- `frontend/app/admin/planning/page.tsx` :
  - on **garde** son bouton « Masquer/Afficher le menu » (même contexte partagé) ;
  - on **retire** uniquement le `useEffect(() => () => setCollapsed(false), …)` de reset à la sortie de page (ligne ~130), incompatible avec la persistance.

## Tests
Un test RTL `frontend/__tests__/AdminLayout.test.tsx` (mocks de `useAuth`/`useClub`/`api` sur le modèle des tests existants) :
1. le toggle masque puis ré-affiche l'aside ;
2. la préférence est relue depuis localStorage au montage (collapsed initial si la clé dit masqué) ;
3. le toggle écrit la clé localStorage.

## Hors périmètre
- Rail d'icônes (option écartée) ;
- responsive mobile spécifique (la sidebar admin actuelle n'a pas de traitement mobile dédié — statu quo) ;
- même traitement pour la sidebar `/superadmin` (à envisager dans un second temps si le pattern plaît).
