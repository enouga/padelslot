# Frontend Next.js 16 — image de production.
FROM node:22-bookworm

WORKDIR /app

# Variables publiques (gelées au moment du build) — fournies par docker-compose en build args.
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_ROOT_DOMAIN
ARG NEXT_PUBLIC_COOKIE_DOMAIN
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_ROOT_DOMAIN=$NEXT_PUBLIC_ROOT_DOMAIN \
    NEXT_PUBLIC_COOKIE_DOMAIN=$NEXT_PUBLIC_COOKIE_DOMAIN

COPY package*.json ./
RUN npm ci

# Le .dockerignore exclut .env* (sinon .env.local écraserait les NEXT_PUBLIC_* ci-dessus).
COPY . .
RUN npm run build

ENV NODE_ENV=production
EXPOSE 3000

# SITE_USER / SITE_PASS (verrou Basic Auth) sont lus à l'exécution par proxy.ts → env runtime.
CMD ["npm", "run", "start"]
