# Backend Express 5 + Prisma 7 (Postgres) + ioredis — image de production.
# Debian (bookworm) plutôt qu'Alpine : OpenSSL/glibc bien supportés par Prisma et bcrypt.
FROM node:22-bookworm

WORKDIR /app

# Dépendances (on garde les devDeps : typescript + CLI prisma pour le build, ts-node pour le seed).
COPY package*.json ./
RUN npm ci

# Code source (le .dockerignore exclut node_modules, dist, .env…)
COPY . .

# Génère le client Prisma puis compile TypeScript → dist/
RUN npx prisma generate && npm run build

ENV NODE_ENV=production
EXPOSE 3001

# Au démarrage : applique les migrations (prisma.config.ts lit DATABASE_URL) puis lance le serveur.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/app.js"]
