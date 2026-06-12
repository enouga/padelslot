# Runbook — Stratégie de sauvegarde de Palova

> Objectif : ne jamais pouvoir perdre plus de 24 h de données en prod, et savoir **restaurer** (une sauvegarde non testée n'est pas une sauvegarde).
> Couvre : la **BDD Postgres**, l'**applicatif**, les **secrets** — en **local (Docker dev)** et en **prod (VM Hetzner ou Vercel)**.

---

## L'essentiel en bref

**Principes (§1)** — règle 3-2-1, objectifs chiffrés (RPO 24 h de perte max, RTO restore < 1 h), et un inventaire dont la conclusion clé est que **seuls Postgres et les secrets sont irremplaçables** : le code est couvert par GitHub, Redis ne contient que des verrous TTL 10 min (rien à sauvegarder), les certificats Caddy se ré-émettent seuls.

**Local — Docker dev (§2)** — criticité faible (tout se reconstruit avec `db:migrate` + `db:seed`), mais script `backup-local.ps1` fourni (pg_dump format custom, rotation 10 dumps, stockage hors OneDrive/git) + procédure de restore. Point important : le volume `postgres_data` vit dans la VM Docker Desktop, **pas** dans OneDrive — la synchro OneDrive du projet ne le couvre pas.

**Prod Hetzner (§3)** — dispositif à 3 niveaux complémentaires :
1. **Backups Hetzner** de la VM (+20 %, ~0,80 €/mois) en filet global ;
2. **`deploy/backup-db.sh`** (script complet fourni) : pg_dump quotidien par cron à 3 h, garde-fou sur la taille du dump, rotation 14 jours ;
3. **copie hors site** vers une Storage Box Hetzner (ou S3/B2 via rclone), avec chiffrement `age` optionnel.

Plus deux **runbooks de restauration** (base corrompue sur VM existante / VM totalement perdue) et la **supervision par healthchecks.io** (alerte e-mail si le cron ne tourne plus — le point que tout le monde oublie).

**Variante Vercel (§4)** — Vercel étant stateless, rien à sauvegarder côté frontend (juste exporter les variables d'env) ; la base passerait sur un Postgres managé (Neon/Supabase) avec PITR intégré, **mais** en gardant un pg_dump quotidien indépendant chez soi pour ne pas dépendre du fournisseur. Note au passage : le backend Express (SSE, cron) ne tient pas tel quel sur Vercel.

**Secrets (§5)** — checklist de ce qui doit aller au gestionnaire de mots de passe (`.env.prod`, clé SSH — actuellement uniquement dans OneDrive —, JWT_SECRET avec ses implications en cas de perte ou de fuite).

**Tests de restauration (§6)** — procédure trimestrielle de 15 min pour restaurer le dump prod dans le Postgres local, avec une ligne en bas du fichier pour dater le dernier test réussi.

**Récap & checklist (§7)** — tableau de synthèse par environnement + checklist de mise en place dans l'ordre de priorité.

---

## 1. Principes

### La règle 3-2-1
- **3** copies des données (l'original + 2 sauvegardes),
- sur **2** supports différents,
- dont **1** hors site (pas sur la même machine / le même datacenter).

### RPO / RTO — fixer ses objectifs avant de choisir les outils
| Terme | Définition | Cible Palova prod |
|---|---|---|
| **RPO** (Recovery Point Objective) | Combien de données on accepte de perdre au maximum | **24 h** (dump quotidien) — réductible à 1 h si besoin |
| **RTO** (Recovery Time Objective) | Combien de temps pour remettre le service en ligne | **< 1 h** (restore documenté ci-dessous) |

### Ce qui doit être sauvegardé — inventaire Palova

| Donnée | Criticité | Où elle vit | Stratégie |
|---|---|---|---|
| **BDD PostgreSQL** (clubs, users, résas, paiements, packages…) | 🔴 Critique, **irremplaçable** | Volume Docker `postgres_data` | `pg_dump` + copie hors site |
| **Code applicatif** (backend + frontend) | 🟢 Déjà couvert | Git → **GitHub** (`github.com/enouga/palova`) + copie locale OneDrive | Pousser régulièrement ; GitHub **est** la sauvegarde |
| **Migrations Prisma** | 🟢 Dans git | `backend/prisma/migrations/` | Rien de plus : le schéma se reconstruit avec `prisma migrate deploy` |
| **Secrets** (`.env`, `.env.prod`, clé SSH) | 🔴 Critique, **hors git** | VM + poste local | Gestionnaire de mots de passe (voir §5) |
| **Redis** | ⚪ Éphémère | Volume `redis_data` | **Aucune sauvegarde** : ne contient que des verrous de checkout à TTL 10 min, tout est reconstructible |
| **Certificats TLS (Caddy)** | ⚪ Reconstructible | Volume Caddy sur la VM | Aucune : Caddy les ré-émet automatiquement (Let's Encrypt) |
| **Fichiers uploadés** | ⚪ N/A aujourd'hui | — | Les images (`imageUrl`, `logoUrl`…) sont des URLs externes. **⚠️ Si un jour on stocke des uploads sur disque, les ajouter à ce runbook.** |

> **À retenir : la seule donnée vraiment irremplaçable, c'est Postgres** (+ les secrets). Tout le reste se reconstruit depuis git.

---

## 2. Local (dev, Docker Desktop Windows)

### Criticité réelle : faible
La base locale est **reconstructible** en 2 commandes (`npm run db:migrate` + `npm run db:seed`). On sauvegarde surtout pour ne pas perdre des **données de test élaborées à la main** (clubs, tournois, paiements de test…).

> ⚠️ Le volume Docker `postgres_data` vit **dans la VM Docker Desktop**, pas dans OneDrive : il n'est **pas** couvert par la synchro OneDrive du projet.

### Sauvegarde manuelle (avant une migration risquée, un gros refactor…)

```powershell
# Depuis n'importe où (le conteneur s'appelle palova_postgres_1 avec compose v1)
docker exec palova_postgres_1 pg_dump -U palovauser -Fc palova > "$env:USERPROFILE\palova-backups\palova-dev-$(Get-Date -Format 'yyyy-MM-dd-HHmm').dump"
```

- `-Fc` = format **custom** compressé : restaurable sélectivement avec `pg_restore` (table par table si besoin).
- Stocker **hors du projet** (ex. `%USERPROFILE%\palova-backups\`) pour ne pas polluer git/OneDrive avec des dumps.

### Script `backup-local.ps1` (à poser à la racine, comme `start.ps1`)

```powershell
$BACKUP_DIR = "$env:USERPROFILE\palova-backups"
New-Item -ItemType Directory -Force $BACKUP_DIR | Out-Null
$stamp = Get-Date -Format 'yyyy-MM-dd-HHmm'
$file = "$BACKUP_DIR\palova-dev-$stamp.dump"

docker exec palova_postgres_1 pg_dump -U palovauser -Fc palova > $file
if ($LASTEXITCODE -eq 0) {
    Write-Host "Sauvegarde OK -> $file" -ForegroundColor Green
    # Rotation : ne garder que les 10 derniers dumps
    Get-ChildItem $BACKUP_DIR -Filter 'palova-dev-*.dump' |
        Sort-Object LastWriteTime -Descending |
        Select-Object -Skip 10 |
        Remove-Item -Confirm:$false
} else {
    Write-Host "ECHEC de la sauvegarde (conteneur demarre ?)" -ForegroundColor Red
}
```

### Restauration locale

```powershell
# 1. Copier le dump dans le conteneur
docker cp "$env:USERPROFILE\palova-backups\palova-dev-2026-06-12-0900.dump" palova_postgres_1:/tmp/restore.dump

# 2. Restaurer (--clean --if-exists : écrase les objets existants)
docker exec palova_postgres_1 pg_restore -U palovauser -d palova --clean --if-exists /tmp/restore.dump
```

Cas « tout est cassé, je repars de zéro » :
```powershell
docker-compose-v1.exe down -v        # ⚠️ -v détruit les volumes (Postgres ET Redis)
docker-compose-v1.exe up -d
cd backend; npm run db:migrate; npm run db:seed
```

---

## 3. Prod — VM Hetzner (architecture actuelle du runbook déploiement)

Trois niveaux **complémentaires** — le niveau 2 est le cœur, les deux autres sont des filets.

### Niveau 1 — Backups Hetzner de la VM (filet de sécurité global)
Console Hetzner → serveur → **Backups** → activer (**+20 % du prix de la VM**, soit ~0,80 €/mois sur une CX22).
- 7 sauvegardes glissantes de **toute la VM** (disque complet, automatique, quotidien).
- Restaure la machine entière en quelques minutes (OS + Docker + volumes + `.env.prod`).
- **Limite** : granularité « machine entière » et la sauvegarde d'un Postgres **en cours d'écriture** peut théoriquement être incohérente → ne **remplace pas** les `pg_dump` (qui sont, eux, transactionnellement cohérents).

### Niveau 2 — `pg_dump` quotidien + rotation (le cœur du dispositif)

Créer `deploy/backup-db.sh` (dans le repo, donc versionné et déployé avec le reste) :

```bash
#!/usr/bin/env bash
# Sauvegarde quotidienne de la BDD Palova — à lancer par cron sur la VM.
set -euo pipefail

PALOVA_DIR=/root/palova
BACKUP_DIR=/root/backups
RETENTION_DAYS=14
STAMP=$(date +%F-%H%M)

mkdir -p "$BACKUP_DIR"
cd "$PALOVA_DIR"

# Dump cohérent (format custom compressé), directement depuis le conteneur
docker compose --env-file .env.prod -f docker-compose.prod.yml exec -T postgres \
  pg_dump -U palovauser -Fc palova > "$BACKUP_DIR/palova-$STAMP.dump"

# Garde-fou : un dump anormalement petit = problème (base vide, conteneur HS…)
SIZE=$(stat -c%s "$BACKUP_DIR/palova-$STAMP.dump")
if [ "$SIZE" -lt 10000 ]; then
  echo "ERREUR : dump suspect ($SIZE octets)" >&2
  exit 1
fi

# Rotation locale
find "$BACKUP_DIR" -name 'palova-*.dump' -mtime +"$RETENTION_DAYS" -delete

echo "OK $STAMP ($SIZE octets)"
```

Puis sur la VM, l'inscrire dans cron (3 h du matin, heure creuse) :
```bash
chmod +x /root/palova/deploy/backup-db.sh
crontab -e
# ajouter :
0 3 * * * /root/palova/deploy/backup-db.sh >> /var/log/palova-backup.log 2>&1
```

> `-T` est indispensable avec `exec` dans cron (pas de TTY).
> **RPO plus serré ?** Passer le cron à `0 * * * *` (toutes les heures) — un dump Palova est petit, ça ne coûte rien.

### Niveau 3 — Copie hors site (le « 1 » du 3-2-1)

Un dump qui reste sur la VM disparaît **avec** la VM (suppression accidentelle, incident datacenter, compromission). Deux bonnes options :

**Option A — Hetzner Storage Box (recommandée : même console, ~3,8 €/mois pour 1 To)**
1. Console Hetzner → commander une **Storage Box** (BX11) → activer l'accès SSH/SCP.
2. Sur la VM, ajouter à la fin de `backup-db.sh` :
```bash
# Copie hors site vers la Storage Box (mot de passe via clé SSH dédiée, port 23)
scp -P 23 "$BACKUP_DIR/palova-$STAMP.dump" uXXXXXX@uXXXXXX.your-storagebox.de:backups/
```

**Option B — S3 compatible (Backblaze B2, Scaleway, AWS S3…)** avec `rclone` :
```bash
rclone copy "$BACKUP_DIR/palova-$STAMP.dump" b2:palova-backups/
```

**Chiffrement (recommandé dès que le dump quitte la VM)** — avec [`age`](https://github.com/FiloSottile/age), plus simple que GPG :
```bash
age -r age1<clé_publique> -o "$BACKUP_DIR/palova-$STAMP.dump.age" "$BACKUP_DIR/palova-$STAMP.dump"
# → c'est le .age qu'on copie hors site ; la clé privée vit dans le gestionnaire de mots de passe
```

### Restauration en prod (runbook)

**Scénario A — restaurer la base sur la VM existante** (fausse manip, migration ratée…) :
```bash
ssh -i <clé> root@167.233.41.155
cd /root/palova

# 1. Couper le backend (plus d'écritures pendant le restore)
docker compose --env-file .env.prod -f docker-compose.prod.yml stop backend

# 2. Restaurer le dump choisi
docker compose --env-file .env.prod -f docker-compose.prod.yml exec -T postgres \
  pg_restore -U palovauser -d palova --clean --if-exists < /root/backups/palova-2026-06-12-0300.dump

# 3. Relancer
docker compose --env-file .env.prod -f docker-compose.prod.yml start backend
curl -fsS https://api.palova.fr/health
```

**Scénario B — la VM est perdue** (reconstruction complète, RTO ~30-45 min) :
1. Recréer une VM (runbook `deploiement-hetzner.md`, étapes 1 à 5) — le code vient de GitHub, les secrets du gestionnaire de mots de passe.
2. **Ne pas seeder.** Récupérer le dernier dump depuis la Storage Box (`scp -P 23 uXXXXXX@…:backups/palova-<date>.dump.age .` puis `age -d`).
3. Restaurer comme au scénario A.
4. Repointer le DNS OVH si l'IP a changé.

### Supervision : savoir quand une sauvegarde **n'a pas** tourné
Un cron qui meurt en silence = des mois sans sauvegarde sans le savoir. Solution simple et gratuite : [healthchecks.io](https://healthchecks.io) (dead man's switch) — ajouter en dernière ligne de `backup-db.sh` :
```bash
curl -fsS -m 10 https://hc-ping.com/<uuid-du-check> > /dev/null
```
Si le ping n'arrive pas dans les temps (cron cassé, script en erreur grâce à `set -e`), tu reçois un **e-mail d'alerte**.

---

## 4. Prod — variante Vercel

Si le frontend (voire le tout) part sur Vercel, la donne change : **Vercel est stateless**, il n'y a rien à sauvegarder côté hébergement applicatif.

| Composant | Où | Quoi sauvegarder |
|---|---|---|
| Frontend Next.js | Vercel | **Rien** (rebuild depuis GitHub à chaque deploy). Exporter une fois les **variables d'environnement** : `vercel env pull .env.vercel` → gestionnaire de mots de passe |
| Backend Express | Reste sur une VM (Hetzner) ou un PaaS — Vercel ne convient pas tel quel (SSE longue durée, cron, Express) | Stateless aussi : couvert par git |
| **PostgreSQL** | Postgres **managé** : Neon, Supabase, Vercel Postgres (=Neon), Scaleway… | Voir ci-dessous |
| Redis | Upstash / managé | Rien (éphémère, comme aujourd'hui) |

**Postgres managé — ce que ça change** :
- Le fournisseur gère les sauvegardes automatiques et souvent le **PITR** (Point-In-Time Recovery : revenir à *n'importe quelle minute*, RPO ≈ 0). Neon : restore par branche ; Supabase : backups quotidiens (PITR en plan payant).
- **Garder quand même un `pg_dump` quotidien indépendant** (depuis la VM backend ou un GitHub Action), vers un stockage **à toi** : c'est ta porte de sortie si le fournisseur a un incident, ferme, ou te verrouille. Même script qu'au §3, seule l'URL change :
```bash
pg_dump "postgresql://user:pass@ep-xxx.neon.tech/palova?sslmode=require" -Fc > palova-$STAMP.dump
```

---

## 5. Les secrets : le maillon oublié

Un restore est **impossible** sans eux. À conserver dans un **gestionnaire de mots de passe** (Bitwarden, 1Password…), jamais seulement sur la machine :

- [ ] `.env.prod` complet (POSTGRES_PASSWORD, JWT_SECRET, SITE_USER/PASS, SMTP_*, SUPERADMIN_PASSWORD)
- [ ] Clé SSH privée `id_ed25519` (actuellement uniquement dans OneDrive — en mettre une copie chiffrée au coffre)
- [ ] Identifiants console Hetzner + OVH (DNS) + GitHub
- [ ] Clé privée `age` si chiffrement des dumps (§3)
- [ ] Identifiants Storage Box / bucket S3

> ⚠️ **JWT_SECRET** : s'il est perdu, les données survivent mais **toutes les sessions sont invalidées** (reconnexion forcée de tous les utilisateurs). S'il **fuite**, n'importe qui peut forger des tokens → le faire tourner immédiatement.

---

## 6. Tester les restaurations (sinon tout ce qui précède est de la théorie)

**Une fois par trimestre** (15 min, se mettre un rappel) :
1. Récupérer le dump prod de la veille sur son poste.
2. Le restaurer **dans le Postgres local** :
   ```powershell
   docker exec -i palova_postgres_1 psql -U palovauser -c "DROP DATABASE IF EXISTS palova_restore; CREATE DATABASE palova_restore;"
   docker cp .\palova-<date>.dump palova_postgres_1:/tmp/r.dump
   docker exec palova_postgres_1 pg_restore -U palovauser -d palova_restore /tmp/r.dump
   ```
3. Vérifier : `docker exec palova_postgres_1 psql -U palovauser -d palova_restore -c "SELECT count(*) FROM reservations;"` — comparer à un ordre de grandeur attendu.
4. Noter la date du test (ici, en bas de ce fichier).
5. `DROP DATABASE palova_restore;` pour nettoyer.

> Bonus : ce test te donne au passage une **copie de la prod en local** pour reproduire des bugs sur données réelles.

---

## 7. Récapitulatif

| Environnement | Quoi | Comment | Fréquence | Rétention | Hors site |
|---|---|---|---|---|---|
| Local | Postgres dev | `backup-local.ps1` (manuel) | Avant opération risquée | 10 dumps | Non (inutile) |
| Hetzner | VM entière | Backups Hetzner (+20 %) | Quotidien (auto) | 7 jours | Non (même DC) |
| Hetzner | Postgres prod | `deploy/backup-db.sh` (cron 3 h) | **Quotidien** | 14 jours | **Oui** → Storage Box |
| Hetzner | Supervision | healthchecks.io | À chaque run | — | — |
| Vercel/managé | Postgres managé | PITR fournisseur **+** pg_dump indépendant | Continu + quotidien | Selon plan + 14 j | Oui |
| Partout | Code | GitHub (`git push`) | À chaque commit | Infinie | Oui |
| Partout | Secrets | Gestionnaire de mots de passe | À chaque changement | — | Oui |

### Checklist de mise en place (dans l'ordre)
- [ ] Activer les **Backups Hetzner** dans la console (2 clics)
- [ ] Créer `deploy/backup-db.sh`, le committer, le déployer, l'ajouter au **cron** de la VM
- [ ] Commander une **Storage Box** et ajouter la copie `scp` au script
- [ ] Créer le check **healthchecks.io** et ajouter le ping au script
- [ ] Mettre tous les **secrets au coffre** (§5)
- [ ] Créer `backup-local.ps1` pour le confort en dev
- [ ] Faire un **premier test de restauration** (§6) et noter la date ci-dessous

---

*Dernier test de restauration réussi : — (jamais encore effectué)*
