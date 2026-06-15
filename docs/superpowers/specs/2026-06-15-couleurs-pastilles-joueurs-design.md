# Couleurs des pastilles par joueur et par équipe

Date : 2026-06-15

## Intention

Donner une **couleur déterministe** à chaque joueur (et à chaque binôme de tournoi)
pour différencier visuellement les pastilles/cartes, aujourd'hui toutes sur l'accent
bleu du club. Aucune donnée stockée : la couleur dérive de l'identité.

## Mécanisme

Helper pur `frontend/lib/playerColors.ts` :

- `PLAYER_COLORS: string[]` — palette de 8 hex :
  `#5e93da` (bleu), `#ff7a4d` (corail), `#2bb6a3` (turquoise), `#9b8cf0` (violet),
  `#ef6f9e` (rose), `#5bbd6e` (vert), `#e6a93c` (ambre), `#7b7fe0` (indigo).
- `colorForSeed(seed: string): string` — hash déterministe (FNV-1a) du seed,
  modulo la longueur de la palette → un hex. Même seed = même couleur.
  Seed vide / falsy → première couleur (stable, jamais d'exception).

Seed : `userId` quand il est disponible (parties ouvertes, sélecteur de partenaires) ;
sinon l'**id d'inscription** (`reg.id` event, `team.id` tournoi), car les payloads publics
d'inscrits n'exposent volontairement pas l'identifiant utilisateur (noms + avatar seulement).
Un id d'inscription est unique → couleur stable, fonctionnellement « par joueur/équipe ».

## Avatar

`Avatar` reçoit une prop optionnelle `color?: string`. Si fournie, les **initiales**
s'affichent sur ce fond, texte lisible via `inkOn` (déjà existant). Une photo
(`avatarUrl`) n'est pas affectée. Sans la prop : comportement inchangé (`th.accent`).
→ `ProfileMenu` (identité) **non touché**.

## Application par surface

| Surface | Couleur par | Rendu |
|---|---|---|
| `OpenMatches` (pastilles) | joueur `userId` | fond `${c}22` + bordure `${c}` + initiales colorées ; badge « orga » en gris |
| `ParticipantsGrid` event (cartes) | inscription `reg.id` | initiales colorées + filet gauche 4px |
| `TeamsGrid` tournoi (cartes) | équipe `team.id` | 2 avatars en couleur d'équipe + filet gauche 4px |
| `BookingModal` (sélecteur joueurs) | joueur `p.id` | fond `${c}22` + bordure `${c}` + initiales colorées |

Le surlignage « Vous / Votre équipe » (`mine`, ring accent) reste **par-dessus** la
couleur ; le filet gauche garde la couleur joueur/équipe.

## Tests

- `frontend/__tests__/playerColors.test.ts` : déterminisme (même seed → même couleur),
  couleur ∈ palette, seed vide → première couleur, deux seeds différents peuvent
  tomber sur des couleurs différentes.
- Composants : pas de nouveau test RTL (changement de présentation pur).

## Hors périmètre

- Couleur cohérente d'un même joueur entre contextes (un joueur peut avoir « sa »
  couleur en partie ouverte et « la couleur de son équipe » en tournoi — assumé).
- `ProfileMenu`, planning admin, autres avatars.
