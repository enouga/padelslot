#!/usr/bin/env bash
# Déploie la dernière version sur la VM : récupère le code, rebuild, relance.
# Usage (sur la VM, à la racine du repo) :  bash deploy/deploy.sh
set -euo pipefail

cd "$(dirname "$0")/.."

echo ">>> git pull"
git pull --ff-only

echo ">>> rebuild + restart"
docker compose --env-file .env.prod -f docker-compose.prod.yml up -d --build

echo ">>> nettoyage des images inutilisées"
docker image prune -f

echo ">>> état des services"
docker compose --env-file .env.prod -f docker-compose.prod.yml ps
