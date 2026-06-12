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
| Courts | `court-1` indoor 25€/créneau, `court-2` indoor 25€/créneau, `court-3` outdoor 20€/créneau |
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

> **Évolution (2026-06-12) — redesign de la fiche tournoi `/tournois/[id]` :** hero immersif dégradé chaud (coral si urgence), compte à rebours avant clôture + jauge de remplissage + badge places (réutilise `tournamentPlacesLabel`), rangée de cartes méta, **partage** (Web Share API, repli copie) + **export .ics** (UTC, client-side), **timeline** Inscriptions→Clôture→Début, grille des inscrits en **cartes binômes avec avatars** (photo ou initiales, position liste d'attente, surlignage « Votre équipe »). `listParticipants` expose désormais `avatarUrl` (additif). Helpers purs paramétrés par `now` dans `frontend/lib/tournament.ts` (countdown, jauge, ICS…), composants `frontend/components/tournament/*`, `components/ui/Avatar.tsx` (pattern ProfileMenu factorisé), icônes `share`/`download`. La page garde toute la logique métier ; horloge unique `now` posée en effet (jamais de `new Date()` au rendu — hydration). Spec : `docs/superpowers/specs/2026-06-12-fiche-tournoi-redesign-design.md`.

> **Évolution (2026-06-09) — licence joueur + annuaire coéquipier :** le joueur saisit lui-même sa licence (`PATCH /api/clubs/:slug/me/membership`, écrit `ClubMembership.membershipNo` ; lecture `GET …/me/membership`), exposée dans la complétion de profil de `/tournois/[id]`. L'inscription choisit le coéquipier via un **annuaire de recherche par nom** (`GET /api/clubs/:slug/members/search?q=`, réservé aux membres actifs, renvoie id+nom sans e-mail) ; le service `register`/`changePartner` prend désormais un **`partnerUserId`** (l'e-mail n'est plus utilisé). Spec/plan : `docs/superpowers/{specs,plans}/2026-06-09-tournois-licence-annuaire*`.

## Espace super-admin plateforme (v1) ✅ implémenté

Administrateur transverse à tous les clubs (distinct du back-office club `/admin`). Identité = flag `User.isSuperAdmin` (migration additive `add_super_admin`), **revérifié en base à chaque requête** (jamais dans le JWT). Compte seedé `super@palova.fr` (mot de passe via `SUPERADMIN_PASSWORD`, repli `password123` en dev ; le seed **échoue** en prod si la variable est absente). Backend : middleware `requireSuperAdmin` + `PlatformService` + routes `/api/platform/{stats,clubs}`, `PATCH /api/platform/clubs/:id` (statut ACTIVE/SUSPENDED), `POST /api/platform/clubs` (crée club + gérant OWNER), montées derrière `authMiddleware` + `requireSuperAdmin`. La réponse login expose `isSuperAdmin`. Frontend : espace `/superadmin` **sur l'hôte plateforme uniquement** (garde server-verified) — dashboard stats, liste des clubs + suspendre/réactiver, formulaire de création ; le login redirige le super-admin vers `/superadmin`. Suspendre un club le retire de l'annuaire public et rend sa page injoignable (comportement `Club.status` existant). Spec & plan : `docs/superpowers/specs/2026-06-04-super-admin-design.md` et `docs/superpowers/plans/2026-06-04-super-admin.md`.

## Inscription par email + code (v1) ✅ implémenté

L'inscription se valide par **code reçu par email**. `POST /api/auth/register` crée un compte **non vérifié** (`User.emailVerified`, migration `add_email_verification` + backfill des comptes existants à `true`) et envoie un code à 6 chiffres (modèle `EmailVerification` : code **hashé bcrypt**, expiry 15 min, 5 essais max, cooldown renvoi 60 s). `POST /api/auth/verify-email` valide le code → renvoie le JWT ; `POST /api/auth/resend-code` renvoie un code (réponse neutre, pas d'énumération). `login` renvoie **403 `EMAIL_NOT_VERIFIED`** pour un compte non vérifié. Envoi via **nodemailer** (`src/email/mailer.ts`) : transport SMTP si `SMTP_HOST` défini, sinon **fallback console** en dev (+ `devCode` renvoyé dans la réponse hors prod pour tester sans email). ⚠️ **Brancher le SMTP en prod** : variables `SMTP_HOST/PORT/USER/PASS/FROM` (`.env.prod.example` + transmises au conteneur via `docker-compose.prod.yml`) — ex. boîte OVH. Front : `/register` et `/clubs/new` en **2 étapes** (formulaire → `VerifyCodeForm`), `/login` bascule sur la saisie du code si compte non vérifié. Seed (`seed.ts` + `seed-demo.ts`) crée les comptes avec `emailVerified: true`.

## Club-house (v1) ✅ implémenté

La page « Infos » est devenue **« Club-house »**, désormais **landing page du club** : la racine du sous-domaine club (`/`) l'affiche (`/club-house` et `/infos` redirigent vers `/` ; la réservation vit sur `/reserver`). Onglet « Club-house » **en premier** dans `ClubNav` (`href:'/'`), libellé en police **Righteous** (`--font-brand` chargée dans `app/layout.tsx`, exposée comme `th.fontBrand` dans `lib/theme.ts`). Contenu : hero « À la une » (annonce épinglée, `imageUrl` en fond), grille action — créneaux libres du jour (lien profond `/reserver?resource=&start=` qui pré-ouvre la confirmation) + prochains tournois (« Plus que X places ») —, vos réservations, annonces, **offres partenaires** (`Sponsor.offerText`/`offerCode`, migration `add_sponsor_offer`, code promo copiable, saisie dans `/admin/sponsors`). Composants : `ClubHouse.tsx` + `components/clubhouse/*`, helpers purs `lib/clubhouse.ts`. Spec & plan : `docs/superpowers/{specs,plans}/2026-06-10-club-house*`.

> **Évolution (2026-06-12) — bandeau « À la une » toujours actionnable :** corps clampé à 3 lignes, bandeau cliquable (`role="button"` + clavier) qui ouvre une **feuille top-sheet** avec l'annonce complète (pattern ConfirmDialog), CTA toujours visible — « En savoir plus → » (externe) si `linkUrl`, sinon **« Réserver un terrain → »** vers `/reserver` (`stopPropagation` pour ne pas ouvrir la feuille). Tests `HeroAnnouncement.test.tsx`.

> **Évolution (2026-06-12) — offres partenaires v2 :** `Sponsor.offerUntil` (fin de validité, saisie `YYYY-MM-DD` → stockée fin de journée UTC) et `Sponsor.pinned` (« à la une »), migration `add_sponsor_offer_until_pinned`. `listPublic` trie `pinned desc, sortOrder asc`. Section Club-house redessinée (`PartnerOffers.tsx`, prop `now`) : **carte à la une** sur `HERO_GRADIENT` (logo sur tuile blanche, offre en grande typo, chip « Expire J-x » coral si < 48 h via `deadlineCountdown`), **grille d'offres** 2 col ≥ 600 px (cartes cliquables vers `linkUrl` — le bouton code promo est un sibling **hors de l'ancre**), offre expirée ou absente → rangée « Ils soutiennent le club » (logos seuls). Helper pur `offerIsActive` dans `lib/clubhouse.ts`. Admin `/admin/sponsors` : champ date « Offre valable jusqu'au » + case « À la une ». Tests : `PartnerOffers.test.tsx`, `clubhouse.test.ts`, `sponsor.service.test.ts`.

> **Évolution (2026-06-12) — Club-house au langage visuel « agenda » :** le hero « À la une » sans image utilise le **dégradé signature** bleu→bleu nuit (`HERO_GRADIENT` exporté par `components/agenda/AgendaHero.tsx` — source de vérité du dégradé des heros, ex-apricot jugé trop fort puis cyan jugé fluo). Bloc « Prochains events » (`TournamentsAlaUne`) enrichi : chip **compte à rebours** avant clôture (coral si < 48 h, affichée seulement une fois l'horloge connue — prop `now` hydration-safe posée par `ClubHouse`), **mini-jauge de remplissage** (coral si ≤ 5 places), urgence en `ACCENTS.coral`. Lignes « Vos prochaines réservations » : tuile icône teintée accent (style `AgendaCard`).

## Calendrier « Mes réservations » + déplacement de réservation (v1) ✅ implémenté

Troisième onglet **« Calendrier »** dans `/me/reservations` : grille mensuelle (pastilles bleues `ACCENTS.blue` = réservations, barre abricot continue = tournois multi-jours, passé atténué, annulé masqué) + **panneau du jour** (annuler via ConfirmDialog existant, « Gérer » → `/tournois/[id]`, « Déplacer » → `/reserver?move=<id>`). Lecture = fusion côté client de `/api/me/reservations` + `/api/me/tournaments` (aucun nouvel endpoint de lecture) ; helpers purs tz-aware dans `lib/calendar.ts` (clé jour via `Intl` + fuseau du club de **chaque** entrée, puis arithmétique UTC pure). Composants `components/calendar/{MonthCalendar,DayPanel}.tsx`. **Déplacement** : la page Réserver en mode `?move=` (bandeau abricot + Abandonner, date/durée pré-sélectionnées) confirme via **`POST /api/reservations/:id/reschedule`** — transaction Serializable + FOR UPDATE, conflits comptés avec `id != soi` (l'auto-chevauchement marche), verrou Redis du nouveau créneau (garde `sameKey` si seule la durée change), heures ouvrées/fenêtre/membership revalidées, prix recalculé, SSE `slot_released` + `slot_confirmed` ; tout échec laisse l'ancienne résa intacte. Dans BookingModal, le mode move n'a **pas** de phase hold (fermer n'annule rien). Spec & plan : `docs/superpowers/{specs,plans}/2026-06-10-calendrier-mes-reservations*`.

## Caisse & carnets (v1) ✅ implémenté

Paiements en caisse + formules prépayées. Modèles : `PackageTemplate` (offre du club, `kind` ENTRIES|WALLET, prix, entrées ou montant crédité, validité opt.) et `MemberPackage` (solde vivant d'un joueur, `creditsRemaining`/`amountRemaining`), `Payment` étendu (migration `add_packages_caisse` : `reservationId` **optionnel**, `clubId` backfillé, `memberPackageId` = vente, `sourcePackageId` = consommation, `voucherRef/Issuer/Status`) et `PaymentMethod` + `VOUCHER`/`PACK_CREDIT`/`WALLET`. Concurrence : consommation par **décrément conditionnel** (`PackageService.consume`, updateMany `count===0` → `INSUFFICIENT_BALANCE`) — à la confirmation en ligne, dans la **même transaction Serializable** (`confirmReservation(…, paymentSource)`), échec = résa reste PENDING payable autrement. Backend : `PackageService` + routes admin `/packages/templates`, `/members/:userId/packages` (vente encaissée transactionnelle), `/caisse?date=` (totaux par méthode, fuseau club), `/caisse/vouchers` + `PATCH /payments/:id/voucher` (suivi remboursement tickets CE) ; joueur `GET /api/clubs/:slug/me/packages`. Frontend : `/admin/packages` (offres), `/admin/caisse` (récap jour + vente + vouchers), panneau « Encaisser » du planning (ticket CE avec référence, boutons carnet/porte-monnaie avec solde), BookingModal « payer avec mon solde », chips de soldes sur Réserver ; helpers purs `lib/packages.ts`. Pas de paiement CB en ligne ; pas de remboursement auto à l'annulation (recrédit manuel). Brief : `docs/superpowers/briefs/2026-06-10-paiements-caisse.md`.

> **Évolution (2026-06-11) — planning caisse :** le planning admin passe en **grille verticale** (terrains en colonnes avec prix/h + badge Single, heures à gauche, en-tête et gouttière sticky, barre « maintenant » horizontale, auto-scroll sur l'heure courante le jour J). Panneau Encaisser : **chips de montant** « Reste / Total / ÷ joueur » (÷4 double, ÷2 single via `Resource.attributes.format`) + **boutons moyen 1-clic** (Espèces/Carte/Virement/Ticket CE/Abo-Membre/Autre — le select et le bouton Encaisser disparaissent ; Ticket CE ouvre la saisie référence/émetteur en 2 temps, **référence optionnelle**). Chaque bloc COURT payant affiche des **pastilles de paiement** (1 point plein par paiement sur 4 ou 2 places, tout vert + ✓ si soldé, badge réduit sur les blocs trop petits, `+n` si plus de paiements que de places). **Montant dû** = prix de la résa, ou **tarif du terrain (heures pleines/creuses)** si la résa COURT n'a pas de prix — il préremplit le champ (pas de 0,10 €), alimente chips/pastilles/stat « Reste dû » et sert de **plafond d'encaissement** : gardes UI (boutons désactivés, bord rouge) **et** refus backend `PAYMENT_EXCEEDS_DUE` (409, vérifié en transaction Serializable dans `addPayment`). Nouveau `PaymentMethod.MEMBER` (« Abo / Membre », migration `add_member_payment_method`, sans flux d'argent — hors `MONEY_METHODS` de la caisse). Helpers purs en centimes `frontend/lib/caisse.ts` (`tariffCents` miroir de `backend/src/services/pricing.ts`, `dueCents`, `quickAmounts`, `paymentDots` ; + `playerCount` dans `lib/courtType.ts`), composant `frontend/components/admin/PaymentDots.tsx`, tests `frontend/__tests__/caisse.test.ts`.

> **Évolution (2026-06-11) — heures creuses multi-plages :** le modèle tarifaire s'inverse : `Club.peakHours` (une plage d'heures *pleines* par jour) devient **`Club.offPeakHours`** = plages d'heures **creuses** par jour de semaine (clé weekday Luxon 1–7), **plusieurs plages possibles par jour** (`{ "1": [{ "start": 9, "end": 12 }, { "start": 14, "end": 17 }] }`). Jour absent ou `null` = tout en heures pleines. Migration `rename_off_peak_hours` : **renommage de colonne + conversion** des anciennes fenêtres pleines en leur complément creux dans 0–24. Backend : `pricing.ts` (`OffPeakHours`), validation dans `club.service.ts` (`normalizeOffPeakHours` : plages triées, sans chevauchement, `start < end`, objet vide → DbNull). Frontend : type `OffPeakHours` dans `lib/api.ts`, miroir `tariffCents` dans `lib/caisse.ts`, réglages admin avec **ajout/suppression de plages par jour** (`/admin/settings`).

> **Évolution (2026-06-11) — prix AU CRÉNEAU (plus de tarif horaire) :** le prix d'une ressource est le prix d'**une réservation, quelle que soit sa durée** (1h, 1h30, 2h coûtent pareil). `Resource.pricePerHour`/`offPeakPricePerHour` → **`Resource.price`/`offPeakPrice`** (migration `rename_price_per_slot`, renommage pur — les montants gardent leur valeur). Le **tarif creux s'applique ssi le créneau est entièrement en heures creuses** (`classifySlot`, même règle que les quotas) ; à cheval = plein tarif. Backend : `pricing.ts` expose `slotPriceCents` (+ `splitOffPeakMinutes`, `classifySlot`) — `proratedTariffCents`, `effectiveRate` et `isOffPeakHour` **supprimés** ; appliqué dans `holdSlot`, `rescheduleReservation`, `listClubReservations` (dueAmount) et `addPayment` (plafond). `TimeSlot` expose un seul champ **`price`** (`pricePerHour`/`totalPrice` supprimés). Frontend : miroir `tariffCents` plat dans `lib/caisse.ts`, libellés « € / créneau » (Réserver, planning, admin terrains, club-house), BookingModal affiche `slot.price`.

## Events & animations (v1) ✅ implémenté

L'onglet « Tournois » devient **« Events »** (`/events`, redirection `/tournois` → `/events?filtre=competitions`, fiches `/tournois/[id]` inchangées) : page unique fusionnant **tournois + animations** côté client avec filtre `[ Tout | Compétitions | Animations ]`. Nouveau modèle **`ClubEvent`** (kind MELEE/STAGE/SOIREE/INITIATION/AUTRE, capacité opt., prix informatif, `memberOnly`, statut DRAFT/PUBLISHED/CANCELLED, migration `add_club_events`) + **`EventRegistration`** (inscription **individuelle**, `@@unique([eventId,userId])`, réinscription = la ligne CANCELLED repart en fin de file). `EventService` miroir simplifié de `TournamentService` : inscription en transaction Serializable + FOR UPDATE, liste d'attente avec **promotion auto**, BLOCKED refusé partout, `memberOnly` → membre ACTIF requis. Routes : `/api/events/:id{,/register,/registration}`, `/api/clubs/:slug/events`, admin `/api/clubs/:clubId/admin/events*`, `GET /api/me/events`. Front : `/events` + fiche `/events/[id]`, `/admin/events`, bloc Club-house « Prochains events » (TournamentsAlaUne généralisé en `AgendaItem[]`, `pickUpcomingTournaments` remplacé par `mergeAgenda`) ; helpers purs `lib/events.ts`. Hors v1 : blocage de terrains, e-mails, paiement en ligne, récurrence. Spec & plan : `docs/superpowers/{specs,plans}/2026-06-11-events-animations*`.

> **Évolution (2026-06-12) — redesign liste `/events` + fiche `/events/[id]` :** même langage visuel que la fiche tournoi. Liste : cartes `AgendaCard` (tuile icône teintée trophy/bolt, chip compte à rebours coral si < 48 h, mini-jauge de remplissage, prix/« Membres »). Fiche event : hero `AgendaHero`, cartes méta, partage + .ics (`uidPrefix 'event'`), timeline, **liste publique des inscrits** (cartes individuelles avec avatar, position d'attente, « Vous ») via **nouvel endpoint `GET /api/events/:id/participants`** (`EventService.listParticipants`, noms + avatarUrl, jamais l'e-mail, DRAFT masqué) ; position d'attente du joueur affichée sur sa carte d'inscription. Briques partagées : `components/agenda/{AgendaHero,AgendaCard}.tsx` (le hero/MetaCards tournoi sont devenus des habillages d'`AgendaHero`/`MetaCardsRow`), `buildTournamentICS` → **`buildAgendaICS(…, uidPrefix)`**, `ShareActions` prend `item`+`uidPrefix`, `waitlistPosition` généralisé, `components/event/ParticipantsGrid.tsx`.

## Quotas de réservation (v1) ✅ implémenté

Limites de réservations COURT par joueur, choisies par le club : **`Club.bookingQuotas`** (Json nullable, migration `add_booking_quotas` + index `[userId, startTime]` sur reservations). Format `{ "model": "UPCOMING"|"WEEKLY", "subscriber": { "peak": n|null, "offPeak": n|null }, "nonSubscriber": idem }` — `UPCOMING` = résas à venir simultanées, `WEEKLY` = semaine calendaire lun-dim (fuseau club, Luxon `startOf('week')`), limite `null` = illimité, `0` = bloqué, les 4 limites null → DbNull (désactivé). Une résa compte en **creuses ssi 100 % de ses minutes le sont** (`classifySlot` de `pricing.ts`). Backend : `src/services/quotas.ts` (`normalizeBookingQuotas`, branché dans `club.service.ts`), `assertQuota` dans `reservation.service.ts` — appelé par `holdSlot` **et** `rescheduleReservation` (la résa déplacée est exclue du comptage via `excludeReservationId`) ; comptage = CONFIRMED + PENDING < 10 min (même filtre que les conflits), erreurs **409 `QUOTA_PEAK_REACHED` / `QUOTA_OFFPEAK_REACHED`**. Check hors transaction : deux holds simultanés peuvent dépasser de 1 (accepté). Frontend : carte « Quotas de réservation » dans `/admin/settings` (case d'activation, modèle, grille abonnés/non-abonnés × pleines/creuses), messages d'erreur dans `BookingModal` (`BOOKING_ERRORS`, réutilisés par le mode move), types `BookingQuotas`/`QuotaLimits` dans `lib/api.ts`. Tests : `__tests__/quotas.test.ts` + bloc « quotas de réservation » dans `reservation.service.test.ts`.

## Icône & menu profil (v1) ✅ implémenté

Icône profil (`ProfileMenu`, `frontend/components/ProfileMenu.tsx`) visible sur tous les headers connectés — elle **remplace l'ancien `LogoutButton`** (supprimé de `atoms.tsx`) : `ClubNav`, `PlatformLanding`, `/clubs`, `/me/reservations` (branche plateforme), sidebars `/admin` et `/superadmin` (props `direction="up"` + `align="left"`, le panneau s'ouvre vers le haut et vers la droite — sinon il sortirait de l'écran). Menu déroulant : identité (photo d'avatar ou initiales, nom, e-mail, chip Abonné), soldes prépayés du club courant (`isUsable`/`packageLabel` de `lib/packages.ts`), liens (« Mon profil » → `/me/profile` avec hint « · incomplet », Mes réservations, Mes clubs, « Espace club » si gérant du club courant, « Superadmin » si super-admin sur l'hôte plateforme), déconnexion. Chargement paresseux à la 1re ouverture ; rien d'affiché hors connexion. `GET /api/me/profile` et `PATCH /api/me` exposent désormais **`isSuperAdmin`** (relu en base, jamais déduit du JWT). Tests : `frontend/__tests__/ProfileMenu.test.tsx`.

> **Évolution (2026-06-12) — page profil dédiée `/me/profile` :** l'édition inline du menu est remplacée par une page (`frontend/app/me/profile/page.tsx`, shell de `/me/reservations`) : identité (prénom/nom/email **non modifiable**), avatar **photo uploadée**, téléphone, **date de naissance**, sexe, **langue** (préférence stockée, l'UI reste en français), **thème** (Segmented Clair/Sombre branché sur le ThemeProvider/localStorage, pas de backend), licence du club courant (si membre sur un hôte club). Nouveaux champs `User.birthDate/avatarUrl/locale` (migration `add_user_profile_fields`), `PATCH /api/me` accepte `birthDate` (YYYY-MM-DD) et `locale` (fr/en/es). **Première infra d'upload** : `POST /api/me/avatar` (multer memoryStorage, 2 Mo max, JPEG/PNG/WebP, fichier `uploads/avatars/<userId>-<ts>.<ext>`, ancien fichier supprimé), servi par `express.static` sur `/uploads` (`src/utils/uploads.ts`, surchargable via `UPLOADS_DIR`) ; côté front `api.uploadMyAvatar` (FormData, fetch dédié) + helper `assetUrl()` dans `lib/api.ts` (⚠️ les tests qui mockent `lib/api` doivent exposer `assetUrl`). **Prod : volume `backend_uploads:/app/uploads`** dans `docker-compose.prod.yml` (sinon avatars perdus au rebuild). Tests : `backend/src/routes/__tests__/me.routes.test.ts`, `frontend/__tests__/MeProfile.test.tsx`.

## Toggle global de la sidebar admin ✅ implémenté

Bouton chevron (`⟨`) dans l'en-tête de la sidebar `/admin` qui la masque **entièrement** (le contenu passe pleine largeur) ; sidebar masquée, un bouton `⟩` **sticky** en haut à gauche du contenu la ré-affiche. Préférence **persistante** (localStorage `palova:admin-sidebar`, valeurs `collapsed`/`open`, initializer paresseux — pas de mismatch d'hydration car le 1er rendu est « Chargement… »). Généralise `AdminChromeContext` (signature inchangée) : le Planning garde son bouton « Masquer le menu » en doublon, mais son reset à la sortie de page a été **retiré** (incompatible avec la persistance). Tests : `frontend/__tests__/AdminLayout.test.tsx` (⚠️ mocks `useRouter`/`useClub` à identité **stable** — `club` est dans les deps du useEffect de vérification des droits). Spec : `docs/superpowers/specs/2026-06-12-admin-sidebar-toggle-design.md`. Hors périmètre : sidebar `/superadmin`.

## Installation PWA (icône web app) ✅ implémenté

L'app est installable (manifest + icônes, **sans service worker** — non requis par Chrome/Edge, next-pwa reste inactif). **Manifest dynamique par hôte** : `frontend/app/manifest.ts` (dynamique via `headers()`, résolution du slug par `clubSlugFromHost` extrait dans `lib/host.ts`, construction pure `lib/manifest.ts`) — sur un sous-domaine club : nom/`theme_color`(accentColor)/icônes du club ; plateforme ou repli : identité Palova (`public/icon-*.png` + maskable + `apple-touch-icon.png`, générés par `backend/scripts/generate-pwa-icons.ts`). **Icônes club** : `GET /api/clubs/:slug/icon/{192,512,maskable-192,maskable-512,apple-180}.png` (`icon.service.ts`, sharp) — logo « contain » sur fond accentColor, cache disque `uploads/icons/<clubId>-<variant>-<hash(logoUrl)>.png` (volume prod `backend_uploads`), garde 5 s / 5 Mo sur le téléchargement du logo, **tout échec → PNG Palova embarqué** (`backend/assets/pwa/`). L'apple-touch-icon est par club via `generateMetadata()` dans `app/layout.tsx`. **UX** : entrée « Installer l'application » dans `ProfileMenu` (hook `lib/useInstallPrompt.ts` : `beforeinstallprompt`/`appinstalled`/standalone ; états purs `lib/install.ts` : `native` → prompt, `ios-manual` → tutoriel « Sur l'écran d'accueil », `hidden` sinon). ⚠️ jsdom : `matchMedia` est stubé dans `jest.setup.ts`. Spec & plan : `docs/superpowers/{specs,plans}/2026-06-12-pwa-install*`.

## Alias de club (changement de slug) (v1) ✅ implémenté

Seul le **super-admin plateforme** peut changer le slug/sous-domaine d'un club (`POST /api/platform/clubs/:id/slug`, `PlatformService.changeClubSlug`) — le gérant ne le peut pas, et **renommer un club ne touche jamais son slug** (l'UI superadmin propose `slugify(nom)` comme suggestion). L'ancien slug devient un **alias permanent** (`ClubSlugAlias`, PK = slug, migration `add_club_slug_aliases`) : `<ancien>.palova.fr` **redirige en 308** vers `<nouveau>.palova.fr` en conservant chemin + query (résolution `GET /api/clubs/_resolve/:slug` appelée par `app/layout.tsx`, chemin transmis via l'en-tête `x-club-path` posé par `proxy.ts` — qui **purge `x-club-slug`/`x-club-path` entrants sur l'hôte plateforme** (anti-spoofing) ; fetch non caché → pas de boucle après swap-back). Les alias restent **réservés à vie** (refusés à la création de club et au changement de slug, vérifiés **dans la transaction** de création, erreur `SLUG_TAKEN`), sauf pour le club lui-même qui peut **reprendre son propre ancien alias** (swap-back : la ligne d'alias est supprimée). Libellés interdits `RESERVED_SLUGS` (www/app/api/superadmin, erreur `SLUG_RESERVED` 400 ; `SLUG_INVALID` 400 si slugify vide). `slugify` ne laisse plus de tiret final après coupe à 60 (label DNS valide) — **miroir front `lib/slug.ts`, garder les deux synchronisés**. UI : bouton « Changer l'alias » dans `/superadmin/clubs` (dialog avec aperçu de la nouvelle URL + liste des alias existants via `PlatformClub.aliases`). Certificats : aucun travail — `/internal/tls-check` autorise déjà tout `*.palova.fr`. Plan : `docs/superpowers/plans/2026-06-12-changement-alias-sous-domaine.md`.

## À implémenter (pas encore fait)

- Authentification réelle (JWT login/register) — actuellement `DEMO_TOKEN = 'demo-token'` hardcodé dans courts/[id]/page.tsx
- Paiement (dont règlement en ligne des frais d'inscription tournoi — `entryFee` est purement informatif en v1)
- Gestion admin du club (créneaux, tarifs)
- Timezone dynamique depuis `club.timezone` (actuellement UTC_OFFSET=2 hardcodé)
- Tournois & events — évolutions : tableaux/poules/scores & résultats, notifications e-mail (promotion liste d'attente, rappels), blocage automatique de terrains par un tournoi ou un event, récurrence des animations (mêlée hebdo)
- Club-house — évolutions : cherche-partenaire, pouls du club (SSE), identité visuelle par club (photo de couverture, couleur d'accent)
- Caisse — évolutions : recrédit auto à l'annulation, export comptable, consommation de package lors d'un déplacement de résa
