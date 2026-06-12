# Changement de nom de club & alias de sous-domaine — comment ça marche

> Réponse à la question : « si on change le nom du club, peut-on changer l'alias de domaine ? (risqué pour les clubs) ».
> Fonctionnalité implémentée — voir le plan `docs/superpowers/plans/2026-06-12-changement-alias-sous-domaine.md` et la section dédiée de `CLAUDE.md`.

## Changer le nom ≠ changer l'alias

Les deux opérations sont **totalement découplées** :

| Opération | Qui | Effet sur le sous-domaine |
|---|---|---|
| **Renommer le club** (`/admin/settings`, gérant) | Gérant du club | **Aucun** — `updateClub` n'accepte pas le champ `slug`. Un club renommé « Padel Center Lyon » garde `padel-arena-paris.palova.fr`. |
| **Changer l'alias** (`/superadmin/clubs` → « Changer l'alias ») | **Super-admin plateforme uniquement** | Le slug change ; l'ancien devient un alias permanent qui redirige. |

Le dialog superadmin propose une suggestion `slugify(nom actuel)`, mais elle reste une simple suggestion — rien d'automatique. Le gérant ne peut pas changer l'alias lui-même : c'est volontaire, vu le caractère engageant de l'opération.

## Pourquoi ce n'est plus risqué pour les clubs

1. **Les anciens liens ne meurent jamais.** L'ancien slug devient un **alias permanent** (table `ClubSlugAlias`) : `padel-arena-paris.palova.fr/reserver?date=…` répond **308 Permanent Redirect** vers `nouveau-slug.palova.fr/reserver?date=…` — chemin et query préservés. QR codes imprimés, favoris, liens partagés : tout continue de fonctionner.

2. **Personne ne peut squatter l'ancien nom.** Un alias est **réservé à vie** : aucun autre club ne peut être créé avec ce slug ni le revendiquer (`SLUG_TAKEN` 409, vérifié dans la transaction de création, isolation Serializable).

3. **Le retour en arrière est possible.** Le club peut **reprendre son propre ancien alias** (swap-back) : si le changement était une erreur, le super-admin re-bascule et la redirection s'inverse, sans boucle côté serveur.

4. **Pas de problème de certificat HTTPS.** Caddy émet à la demande pour tout `*.palova.fr` (`/internal/tls-check`) : le nouveau sous-domaine obtient son certificat à la première visite, l'ancien continue de fonctionner. Zéro manipulation d'infra.

5. **Labels techniques protégés.** `www`, `app`, `api`, `superadmin` sont refusés (`SLUG_RESERVED` 400) ; un slug vide après normalisation est refusé (`SLUG_INVALID` 400).

## La seule limite résiduelle à connaître

Un navigateur qui a **mis en cache un 308** avant un swap-back peut boucler localement chez cet utilisateur jusqu'au vidage de son cache. C'est inhérent au choix « redirection permanente » et ne concerne que le cas rare *swap-back + cache chaud*. Côté serveur, jamais de boucle (la résolution d'alias n'est pas cachée).

## Mode d'emploi (super-admin)

1. Se connecter en super-admin (`super@palova.fr`) sur l'hôte plateforme → `/superadmin/clubs`.
2. Bouton **« Changer l'alias »** sur la ligne du club → saisir le nouveau slug (suggestion préremplie, aperçu de la nouvelle URL, avertissement sur la redirection).
3. Confirmer. La liste affiche le nouveau slug et les anciens alias (« Alias : … »).
4. Pour revenir en arrière : refaire l'opération avec l'ancien slug (swap-back accepté car l'alias appartient au club).

## Sous le capot (pointeurs code)

- Modèle : `backend/prisma/schema.prisma` → `ClubSlugAlias` (PK = slug, FK club cascade), migration `add_club_slug_aliases`.
- Service : `PlatformService.changeClubSlug` (transaction Serializable, swap-back, P2002 → `SLUG_TAKEN`) ; `ClubService.resolveSlug` (`{slug, moved}`).
- Routes : `POST /api/platform/clubs/:id/slug` (derrière `requireSuperAdmin`) ; `GET /api/clubs/_resolve/:slug` (public, déclarée avant `/:slug/*`).
- Redirection : `frontend/app/layout.tsx` (`permanentRedirect` 308, chemin via l'en-tête `x-club-path` posé par `frontend/proxy.ts`, qui purge les en-têtes `x-club-*` forgeables sur l'hôte plateforme).
- UI : `frontend/app/superadmin/clubs/page.tsx` (`ChangeSlugDialog`), miroir `frontend/lib/slug.ts` de `slugify` backend (garder les deux synchronisés).
