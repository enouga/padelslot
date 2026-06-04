# Runbook — Déploiement de Palova sur une VM Hetzner (Docker + Caddy)

> Objectif : mettre toute l'app en ligne (frontend Next + backend Express + Postgres + Redis) sur **une seule machine**, avec le domaine `palova.fr` et **les sous-domaines clubs `*.palova.fr`**, HTTPS automatique.
> Coût : **~3,79 €/mois** (Hetzner CX22). Effort 1ʳᵉ fois : **~30-45 min** (dont attente DNS/build).

---

## Vue d'ensemble

```
Internet ──► Caddy (:443, HTTPS auto + wildcard)
              ├─ palova.fr, www.palova.fr  ──► frontend (Next, :3000)
              ├─ *.palova.fr (clubs)       ──► frontend (cert à la demande)
              └─ api.palova.fr             ──► backend (Express, :3001)
                                                  │
                            postgres (volume)  +  redis (volume)
```

Tout tourne via `docker-compose.prod.yml` sur la VM. **Mises à jour** = `bash deploy/deploy.sh` (git pull + rebuild). **Aucun changement de code applicatif** : seulement du packaging (Dockerfiles, compose, Caddyfile) + une mini-route backend `/internal/tls-check` pour valider les certificats à la demande.

---

## Pré-requis
- Le code est poussé sur `origin/main` (`github.com/enouga/palova`), **Dockerfiles + compose + Caddyfile inclus**.
- Domaine `palova.fr` chez OVH (zone DNS accessible — déjà fait pour Render, on va juste changer les cibles).
- Un compte **Hetzner Cloud**.

---

## Étape 1 — Créer la VM
1. Hetzner Cloud Console → **New Project** (« palova ») → **Add Server**.
2. Réglages :
   - **Location** : Nuremberg ou Falkenstein (Allemagne, latence FR excellente).
   - **Image** : **Ubuntu 24.04**.
   - **Type** : **CX22** (2 vCPU, 4 Go RAM) — suffisant.
   - **SSH key** : ajoute ta clé publique *(recommandé)*, sinon Hetzner t'enverra un mot de passe root par e-mail.
   - **Firewalls** : crée/attache un firewall autorisant **22 (SSH), 80 (HTTP), 443 (HTTPS)** en entrée.
3. **Create & Buy**. Note l'**IPv4** affichée (= l'IP de ta VM).

## Étape 2 — DNS chez OVH (pointer le domaine vers la VM)
Dans la **Zone DNS** OVH de `palova.fr`, on remplace les valeurs Render par l'**IP de la VM** et on **ajoute le wildcard** :

| Action | Type | Sous-domaine | Cible |
|---|---|---|---|
| **Modifier** | A | *(vide = racine)* | **IP de la VM** |
| **Modifier** | A | `www` | **IP de la VM** |
| **Modifier** (était CNAME Render) | A | `api` | **IP de la VM** |
| **Ajouter** | A | `*` (wildcard) | **IP de la VM** |

> Le `*` couvre tous les sous-domaines clubs (`padel-arena-paris.palova.fr`, etc.). **Ne touche pas** aux entrées mail (MX, SPF, SRV, DKIM…).
> ⚠️ Si `api` était un **CNAME** (vers onrender), supprime-le et crée une entrée **A** à la place (on ne peut pas avoir A et CNAME sur le même nom).

## Étape 3 — Installer Docker sur la VM
Connecte-toi : `ssh root@<IP_DE_LA_VM>` puis :
```bash
curl -fsSL https://get.docker.com | sh
docker --version    # vérif
```

## Étape 4 — Récupérer le code et configurer les secrets
```bash
git clone https://github.com/enouga/palova.git
cd palova
cp .env.prod.example .env.prod
nano .env.prod      # remplis POSTGRES_PASSWORD, JWT_SECRET, SITE_USER, SITE_PASS
```
*(Pour générer un JWT_SECRET : `openssl rand -hex 48`.)*

## Étape 5 — Lancer toute la stack
```bash
docker compose --env-file .env.prod -f docker-compose.prod.yml up -d --build
```
- Le **build** prend quelques minutes (2 images Node). 
- Au démarrage, le backend lance **`prisma migrate deploy`** → les tables sont créées automatiquement.
- Caddy obtient les certificats HTTPS de `palova.fr` et `api.palova.fr` (dès que le DNS de l'étape 2 est propagé).

Vérifier que tout tourne :
```bash
docker compose --env-file .env.prod -f docker-compose.prod.yml ps
docker compose --env-file .env.prod -f docker-compose.prod.yml logs -f caddy    # Ctrl-C pour sortir
```

## Étape 6 — Seeder les données démo (une seule fois)
```bash
docker compose --env-file .env.prod -f docker-compose.prod.yml exec backend npm run db:seed
```
Crée le club démo (`padel-arena-paris`), les terrains, le compte `test@palova.fr` / `password123`, les tournois.

## Étape 7 — Vérification finale
Depuis un réseau **hors entreprise** (le FortiClient de BAYARD bloque `palova.fr`) — ton téléphone en données mobiles, ou chez toi :
- `https://api.palova.fr/health` → `{"status":"ok"}`
- `https://palova.fr` → **pop-up login** (Basic Auth = `SITE_USER`/`SITE_PASS`) puis la plateforme
- `https://padel-arena-paris.palova.fr` → **accueil du club** + lien **Tournois** *(1ʳᵉ visite d'un nouveau sous-domaine = 1-2 s de plus, le temps d'émettre son certificat)*
- Connexion app avec `test@palova.fr` / `password123` ; le gérant atterrit sur `/admin`.

---

## Mises à jour futures
À chaque évolution poussée sur `main` :
```bash
ssh root@<IP_DE_LA_VM>
cd palova && bash deploy/deploy.sh
```
*(récupère le code, rebuild, relance, nettoie — rejoue `prisma migrate deploy` au passage.)*

## Dépannage
- **`exec format error` sur `deploy.sh`** : fichier en CRLF. Lance-le via `bash deploy/deploy.sh` (pas `./`), ou `sed -i 's/\r$//' deploy/deploy.sh`.
- **Certificat HTTPS non émis** : DNS pas encore propagé, ou ports 80/443 fermés dans le firewall Hetzner. Voir `docker compose ... logs caddy`.
- **`prisma migrate deploy` échoue** : la base n'est pas prête — vérifier `docker compose ... logs postgres` et que `POSTGRES_PASSWORD` est identique dans `.env.prod` et l'URL backend (c'est le cas par construction).
- **Build qui manque de RAM** : sur CX22 (4 Go) ça passe ; si tu prends plus petit, ajoute du swap (`fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile`).
- **Sauvegardes** : active les **Backups** Hetzner (~+20 %) ou fais un dump régulier : `docker compose ... exec postgres pg_dump -U palovauser palova > backup.sql`.

## Accès privé / ouverture au public
Tant que `SITE_USER`/`SITE_PASS` sont dans `.env.prod`, tout le site demande un login (pop-up). Pour ouvrir au public : vide ces 2 variables et relance `bash deploy/deploy.sh`.
