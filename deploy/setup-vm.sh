#!/usr/bin/env bash
# Installe et lance Palova sur une VM Ubuntu fraîche, en une commande.
# Usage (à la racine du repo cloné) :  bash deploy/setup-vm.sh
set -euo pipefail

cd "$(dirname "$0")/.."

# 1) Docker (installé seulement s'il manque)
if ! command -v docker >/dev/null 2>&1; then
  echo ">>> Installation de Docker..."
  curl -fsSL https://get.docker.com | sh
fi

# 2) Fichier de secrets .env.prod (créé s'il n'existe pas).
#    Les secrets techniques (DB, JWT) sont générés automatiquement ;
#    seuls l'identifiant/mot de passe d'accès privé sont demandés (courts à taper).
if [ ! -f .env.prod ]; then
  echo ">>> Création de .env.prod (secrets DB/JWT générés automatiquement)"
  POSTGRES_PASSWORD="$(openssl rand -hex 16)"
  JWT_SECRET="$(openssl rand -hex 48)"
  read -rp "Choisis un identifiant d'accès privé (SITE_USER) : " SITE_USER
  read -rp "Choisis un mot de passe d'accès privé (SITE_PASS) : " SITE_PASS
  cat > .env.prod <<EOF
POSTGRES_PASSWORD=$POSTGRES_PASSWORD
JWT_SECRET=$JWT_SECRET
SITE_USER=$SITE_USER
SITE_PASS=$SITE_PASS
EOF
fi

# 3) Build + démarrage de toute la stack
echo ">>> Build et démarrage (quelques minutes la 1ère fois)..."
docker compose --env-file .env.prod -f docker-compose.prod.yml up -d --build

echo ""
echo ">>> État des services :"
docker compose --env-file .env.prod -f docker-compose.prod.yml ps
echo ""
echo ">>> Pour charger les données démo (à faire une fois) :"
echo "    docker compose --env-file .env.prod -f docker-compose.prod.yml exec backend npm run db:seed"
