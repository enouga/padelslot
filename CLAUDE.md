# Palova — Instructions pour Claude

Application de réservation de terrains de padel. Backend API séparé du frontend Next.js.

## Démarrage

```bash
# 1. Démarrer PostgreSQL + Redis (Docker)
"C:\Program Files\Docker\Docker\resources\bin\docker-compose-v1.exe" up -d

# 2. Backend (dans un terminal, dossier backend/)
npm run dev
# → http://localhost:3001

# 3. Frontend (dans un autre terminal, dossier frontend/)
npm run dev
# → http://localhost:3000
```

> **IMPORTANT — Docker** : La version installée (20.10.23) n'a pas le plugin `compose`. Toujours utiliser `docker-compose-v1.exe`, jamais `docker compose`.

## Architecture

```
palova/
├── docker-compose.yml       postgres:16 (5432) + redis:7 (6379)
├── backend/                 Express 5 + Prisma 7 + ioredis, port 3001
│   ├── .env                 DATABASE_URL, REDIS_HOST, JWT_SECRET, PORT=3001
│   ├── prisma/schema.prisma Club, Court, User, Reservation
│   └── src/
│       ├── app.ts
│       ├── db/prisma.ts     ← Prisma 7 : DOIT utiliser PrismaPg adapter
│       ├── redis/client.ts
│       ├── services/        availability, reservation, sse
│       └── jobs/cleanup.job.ts
└── frontend/                Next.js 16 + React 19 + Tailwind v4, port 3000
    ├── .env.local           NEXT_PUBLIC_API_URL=http://localhost:3001
    ├── instrumentation.ts   gère les crashes EPIPE du serveur dev
    └── app/
        ├── courts/page.tsx        liste des terrains (server component)
        └── courts/[id]/page.tsx   réservation (client component)
```

## Contraintes techniques critiques

### Prisma 7 — driver adapter obligatoire
```typescript
// TOUJOURS faire ça, jamais new PrismaClient() seul
import { PrismaPg } from '@prisma/adapter-pg';
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });
```
S'applique à `src/db/prisma.ts` ET `prisma/seed.ts`.

### Next.js 16 — breaking changes
- **Turbopack** est le bundler par défaut (pas Webpack)
- **`params` dans les server pages** = Promise → toujours `await params`
- **`middleware.ts`** renommé en `proxy.ts`
- **`next lint`** supprimé — utiliser ESLint directement

### next-pwa@5.6.0 installé mais NON configuré
Incompatible avec Turbopack. Ne pas l'activer dans next.config.ts.

## Données de test (déjà seedées)

| Type  | Données |
|-------|---------|
| Club  | id=`club-demo`, "Padel Arena Paris", 12 rue du Padel Paris |
| Courts | `court-1` indoor 25€/h, `court-2` indoor 25€/h, `court-3` outdoor 20€/h |
| User  | `test@palova.fr` / `password123` |

## Logique métier clé

**Zéro double-réservation** = deux niveaux :
1. **Redis SET NX** (`lock:court:{id}:{startTime}`, TTL 10 min) — bloque dès le début du checkout
2. **PostgreSQL Serializable + SELECT FOR UPDATE** — garantie absolue à la confirmation

**SSE (temps réel)** — `SSEService` singleton broadcast aux clients connectés sur un terrain :
- `slot_held` → créneau pris (PENDING)
- `slot_confirmed` → confirmé
- `slot_released` → libéré (annulation ou expiration)

**Créneaux** : 8h–22h heure Paris (UTC+2 hardcodé), pas de 30 min.

## Bugs connus et résolus

- **EPIPE crash** dev server → géré dans `frontend/instrumentation.ts`
- **Hydration mismatch** extension ColorZilla → `suppressHydrationWarning` sur `<html>` et `<body>` dans layout.tsx
- **Page vide au clic** sur un terrain → `loading` initialisé à `true` dans courts/[id]/page.tsx
- **Slot count** : 8h–22h / 30min step / 60min durée = **27 créneaux** (pas 28)

## Commandes utiles

```bash
# Backend
npm run db:migrate   # appliquer les migrations Prisma
npm run db:seed      # remettre les données de test
npm test             # tests Jest

# Frontend
npm test             # tests React Testing Library

# Vérifier que ça tourne
curl http://localhost:3001/health
curl "http://localhost:3001/api/courts?clubId=club-demo"
```

## Tournois (v1 — inscriptions) ✅ implémenté

Catégories P25→P2000, genre Messieurs/Dames/Mixte (composition 1H+1F contrôlée via `User.sex`), inscription en binôme (les 2 joueurs membres du club avec téléphone + licence `membershipNo`), modification du coéquipier / annulation jusqu'à `registrationDeadline`, liste d'attente avec promotion auto. Backend : `TournamentService` + routes `/api/tournaments/*`, `/api/clubs/:slug/tournaments`, `/api/me/{profile,tournaments}` + `PATCH /api/me`, admin `/api/clubs/:clubId/admin/tournaments`. Frontend : `/tournois`, `/tournois/[id]`, `/admin/tournaments`, lien « Tournois » sur la page d'accueil club. Spec & plan : `docs/superpowers/specs/2026-06-03-tournois-padel-design.md` et `docs/superpowers/plans/2026-06-03-tournois-padel.md`.

> **Évolution (2026-06-09) — licence joueur + annuaire coéquipier :** le joueur saisit lui-même sa licence (`PATCH /api/clubs/:slug/me/membership`, écrit `ClubMembership.membershipNo` ; lecture `GET …/me/membership`), exposée dans la complétion de profil de `/tournois/[id]`. L'inscription choisit le coéquipier via un **annuaire de recherche par nom** (`GET /api/clubs/:slug/members/search?q=`, réservé aux membres actifs, renvoie id+nom sans e-mail) ; le service `register`/`changePartner` prend désormais un **`partnerUserId`** (l'e-mail n'est plus utilisé). Spec/plan : `docs/superpowers/{specs,plans}/2026-06-09-tournois-licence-annuaire*`.

## Espace super-admin plateforme (v1) ✅ implémenté

Administrateur transverse à tous les clubs (distinct du back-office club `/admin`). Identité = flag `User.isSuperAdmin` (migration additive `add_super_admin`), **revérifié en base à chaque requête** (jamais dans le JWT). Compte seedé `super@palova.fr` (mot de passe via `SUPERADMIN_PASSWORD`, repli `password123` en dev ; le seed **échoue** en prod si la variable est absente). Backend : middleware `requireSuperAdmin` + `PlatformService` + routes `/api/platform/{stats,clubs}`, `PATCH /api/platform/clubs/:id` (statut ACTIVE/SUSPENDED), `POST /api/platform/clubs` (crée club + gérant OWNER), montées derrière `authMiddleware` + `requireSuperAdmin`. La réponse login expose `isSuperAdmin`. Frontend : espace `/superadmin` **sur l'hôte plateforme uniquement** (garde server-verified) — dashboard stats, liste des clubs + suspendre/réactiver, formulaire de création ; le login redirige le super-admin vers `/superadmin`. Suspendre un club le retire de l'annuaire public et rend sa page injoignable (comportement `Club.status` existant). Spec & plan : `docs/superpowers/specs/2026-06-04-super-admin-design.md` et `docs/superpowers/plans/2026-06-04-super-admin.md`.

## Inscription par email + code (v1) ✅ implémenté

L'inscription se valide par **code reçu par email**. `POST /api/auth/register` crée un compte **non vérifié** (`User.emailVerified`, migration `add_email_verification` + backfill des comptes existants à `true`) et envoie un code à 6 chiffres (modèle `EmailVerification` : code **hashé bcrypt**, expiry 15 min, 5 essais max, cooldown renvoi 60 s). `POST /api/auth/verify-email` valide le code → renvoie le JWT ; `POST /api/auth/resend-code` renvoie un code (réponse neutre, pas d'énumération). `login` renvoie **403 `EMAIL_NOT_VERIFIED`** pour un compte non vérifié. Envoi via **nodemailer** (`src/email/mailer.ts`) : transport SMTP si `SMTP_HOST` défini, sinon **fallback console** en dev (+ `devCode` renvoyé dans la réponse hors prod pour tester sans email). ⚠️ **Brancher le SMTP en prod** : variables `SMTP_HOST/PORT/USER/PASS/FROM` (`.env.prod.example` + transmises au conteneur via `docker-compose.prod.yml`) — ex. boîte OVH. Front : `/register` et `/clubs/new` en **2 étapes** (formulaire → `VerifyCodeForm`), `/login` bascule sur la saisie du code si compte non vérifié. Seed (`seed.ts` + `seed-demo.ts`) crée les comptes avec `emailVerified: true`.

## Club-house (v1) ✅ implémenté

La page « Infos » est devenue **« Club-house »**, désormais **landing page du club** : la racine du sous-domaine club (`/`) l'affiche (`/club-house` et `/infos` redirigent vers `/` ; la réservation vit sur `/reserver`). Onglet « Club-house » **en premier** dans `ClubNav` (`href:'/'`), libellé en police **Righteous** (`--font-brand` chargée dans `app/layout.tsx`, exposée comme `th.fontBrand` dans `lib/theme.ts`). Contenu : hero « À la une » (annonce épinglée, `imageUrl` en fond), grille action — créneaux libres du jour (lien profond `/reserver?resource=&start=` qui pré-ouvre la confirmation) + prochains tournois (« Plus que X places ») —, vos réservations, annonces, **offres partenaires** (`Sponsor.offerText`/`offerCode`, migration `add_sponsor_offer`, code promo copiable, saisie dans `/admin/sponsors`). Composants : `ClubHouse.tsx` + `components/clubhouse/*`, helpers purs `lib/clubhouse.ts`. Spec & plan : `docs/superpowers/{specs,plans}/2026-06-10-club-house*`.

## Calendrier « Mes réservations » + déplacement de réservation (v1) ✅ implémenté

Troisième onglet **« Calendrier »** dans `/me/reservations` : grille mensuelle (pastilles bleues `ACCENTS.blue` = réservations, barre abricot continue = tournois multi-jours, passé atténué, annulé masqué) + **panneau du jour** (annuler via ConfirmDialog existant, « Gérer » → `/tournois/[id]`, « Déplacer » → `/reserver?move=<id>`). Lecture = fusion côté client de `/api/me/reservations` + `/api/me/tournaments` (aucun nouvel endpoint de lecture) ; helpers purs tz-aware dans `lib/calendar.ts` (clé jour via `Intl` + fuseau du club de **chaque** entrée, puis arithmétique UTC pure). Composants `components/calendar/{MonthCalendar,DayPanel}.tsx`. **Déplacement** : la page Réserver en mode `?move=` (bandeau abricot + Abandonner, date/durée pré-sélectionnées) confirme via **`POST /api/reservations/:id/reschedule`** — transaction Serializable + FOR UPDATE, conflits comptés avec `id != soi` (l'auto-chevauchement marche), verrou Redis du nouveau créneau (garde `sameKey` si seule la durée change), heures ouvrées/fenêtre/membership revalidées, prix recalculé, SSE `slot_released` + `slot_confirmed` ; tout échec laisse l'ancienne résa intacte. Dans BookingModal, le mode move n'a **pas** de phase hold (fermer n'annule rien). Spec & plan : `docs/superpowers/{specs,plans}/2026-06-10-calendrier-mes-reservations*`.

## Caisse & carnets (v1) ✅ implémenté

Paiements en caisse + formules prépayées. Modèles : `PackageTemplate` (offre du club, `kind` ENTRIES|WALLET, prix, entrées ou montant crédité, validité opt.) et `MemberPackage` (solde vivant d'un joueur, `creditsRemaining`/`amountRemaining`), `Payment` étendu (migration `add_packages_caisse` : `reservationId` **optionnel**, `clubId` backfillé, `memberPackageId` = vente, `sourcePackageId` = consommation, `voucherRef/Issuer/Status`) et `PaymentMethod` + `VOUCHER`/`PACK_CREDIT`/`WALLET`. Concurrence : consommation par **décrément conditionnel** (`PackageService.consume`, updateMany `count===0` → `INSUFFICIENT_BALANCE`) — à la confirmation en ligne, dans la **même transaction Serializable** (`confirmReservation(…, paymentSource)`), échec = résa reste PENDING payable autrement. Backend : `PackageService` + routes admin `/packages/templates`, `/members/:userId/packages` (vente encaissée transactionnelle), `/caisse?date=` (totaux par méthode, fuseau club), `/caisse/vouchers` + `PATCH /payments/:id/voucher` (suivi remboursement tickets CE) ; joueur `GET /api/clubs/:slug/me/packages`. Frontend : `/admin/packages` (offres), `/admin/caisse` (récap jour + vente + vouchers), panneau « Encaisser » du planning (ticket CE avec référence, boutons carnet/porte-monnaie avec solde), BookingModal « payer avec mon solde », chips de soldes sur Réserver ; helpers purs `lib/packages.ts`. Pas de paiement CB en ligne ; pas de remboursement auto à l'annulation (recrédit manuel). Brief : `docs/superpowers/briefs/2026-06-10-paiements-caisse.md`.

> **Évolution (2026-06-11) — planning caisse :** le planning admin passe en **grille verticale** (terrains en colonnes avec prix/h + badge Single, heures à gauche, en-tête et gouttière sticky, barre « maintenant » horizontale, auto-scroll sur l'heure courante le jour J). Panneau Encaisser : **chips de montant** « Reste / Total / ÷ joueur » (÷4 double, ÷2 single via `Resource.attributes.format`) + **boutons moyen 1-clic** (Espèces/Carte/Virement/Ticket CE/Abo-Membre/Autre — le select et le bouton Encaisser disparaissent ; Ticket CE ouvre la saisie référence/émetteur en 2 temps, **référence optionnelle**). Chaque bloc COURT payant affiche des **pastilles de paiement** (1 point plein par paiement sur 4 ou 2 places, tout vert + ✓ si soldé, badge réduit sur les blocs trop petits, `+n` si plus de paiements que de places). **Montant dû** = prix de la résa, ou **tarif du terrain (heures pleines/creuses)** si la résa COURT n'a pas de prix — il préremplit le champ (pas de 0,10 €), alimente chips/pastilles/stat « Reste dû » et sert de **plafond d'encaissement** : gardes UI (boutons désactivés, bord rouge) **et** refus backend `PAYMENT_EXCEEDS_DUE` (409, vérifié en transaction Serializable dans `addPayment`). Nouveau `PaymentMethod.MEMBER` (« Abo / Membre », migration `add_member_payment_method`, sans flux d'argent — hors `MONEY_METHODS` de la caisse). Helpers purs en centimes `frontend/lib/caisse.ts` (`tariffCents` miroir de `backend/src/services/pricing.ts`, `dueCents`, `quickAmounts`, `paymentDots` ; + `playerCount` dans `lib/courtType.ts`), composant `frontend/components/admin/PaymentDots.tsx`, tests `frontend/__tests__/caisse.test.ts`.

> **Évolution (2026-06-11) — heures creuses multi-plages :** le modèle tarifaire s'inverse : `Club.peakHours` (une plage d'heures *pleines* par jour) devient **`Club.offPeakHours`** = plages d'heures **creuses** par jour de semaine (clé weekday Luxon 1–7), **plusieurs plages possibles par jour** (`{ "1": [{ "start": 9, "end": 12 }, { "start": 14, "end": 17 }] }`). Jour absent ou `null` = tout en heures pleines. Migration `rename_off_peak_hours` : **renommage de colonne + conversion** des anciennes fenêtres pleines en leur complément creux dans 0–24. Backend : `pricing.ts` (`OffPeakHours`, `isOffPeakHour`, `effectiveRate`), validation dans `club.service.ts` (`normalizeOffPeakHours` : plages triées, sans chevauchement, `start < end`, objet vide → DbNull). Frontend : type `OffPeakHours` dans `lib/api.ts`, miroir `tariffCents` dans `lib/caisse.ts`, réglages admin avec **ajout/suppression de plages par jour** (`/admin/settings`).

## Events & animations (v1) ✅ implémenté

L'onglet « Tournois » devient **« Events »** (`/events`, redirection `/tournois` → `/events?filtre=competitions`, fiches `/tournois/[id]` inchangées) : page unique fusionnant **tournois + animations** côté client avec filtre `[ Tout | Compétitions | Animations ]`. Nouveau modèle **`ClubEvent`** (kind MELEE/STAGE/SOIREE/INITIATION/AUTRE, capacité opt., prix informatif, `memberOnly`, statut DRAFT/PUBLISHED/CANCELLED, migration `add_club_events`) + **`EventRegistration`** (inscription **individuelle**, `@@unique([eventId,userId])`, réinscription = la ligne CANCELLED repart en fin de file). `EventService` miroir simplifié de `TournamentService` : inscription en transaction Serializable + FOR UPDATE, liste d'attente avec **promotion auto**, BLOCKED refusé partout, `memberOnly` → membre ACTIF requis. Routes : `/api/events/:id{,/register,/registration}`, `/api/clubs/:slug/events`, admin `/api/clubs/:clubId/admin/events*`, `GET /api/me/events`. Front : `/events` + fiche `/events/[id]`, `/admin/events`, bloc Club-house « Prochains events » (TournamentsAlaUne généralisé en `AgendaItem[]`, `pickUpcomingTournaments` remplacé par `mergeAgenda`) ; helpers purs `lib/events.ts`. Hors v1 : blocage de terrains, e-mails, paiement en ligne, récurrence. Spec & plan : `docs/superpowers/{specs,plans}/2026-06-11-events-animations*`.

## À implémenter (pas encore fait)

- Authentification réelle (JWT login/register) — actuellement `DEMO_TOKEN = 'demo-token'` hardcodé dans courts/[id]/page.tsx
- Paiement (dont règlement en ligne des frais d'inscription tournoi — `entryFee` est purement informatif en v1)
- Gestion admin du club (créneaux, tarifs)
- Timezone dynamique depuis `club.timezone` (actuellement UTC_OFFSET=2 hardcodé)
- Tournois & events — évolutions : tableaux/poules/scores & résultats, notifications e-mail (promotion liste d'attente, rappels), blocage automatique de terrains par un tournoi ou un event, récurrence des animations (mêlée hebdo)
- Club-house — évolutions : cherche-partenaire, pouls du club (SSE), identité visuelle par club (photo de couverture, couleur d'accent)
- Caisse — évolutions : recrédit auto à l'annulation, export comptable, consommation de package lors d'un déplacement de résa
