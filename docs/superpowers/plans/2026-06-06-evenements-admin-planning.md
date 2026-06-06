# Création d'événements admin depuis le planning — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permettre à un gestionnaire de club de créer, depuis `/admin/planning`, une réservation de n'importe quel type (Terrain/Coaching/Tournoi/Événement) qui bloque le créneau choisi.

**Architecture:** Modèle B — `Reservation.userId` devient optionnel + colonne `title` (migration additive). Une nouvelle route admin `POST .../admin/reservations` + une méthode service `adminCreateReservation` créent une réservation `CONFIRMED` (anti-chevauchement en transaction Serializable), sans soumettre l'admin aux limites joueur. Le front ajoute une modale de création au planning.

**Tech Stack:** Express 5 + Prisma 7 (driver adapter) + luxon (fuseaux) côté backend ; Jest + supertest pour les tests ; Next.js 16 + React 19 côté front.

Spec : `docs/superpowers/specs/2026-06-06-evenements-admin-planning-design.md`.

**Pré-requis d'exécution :** Postgres + Redis up (`docker-compose-v1.exe up -d`). Tests backend depuis `backend/`, front depuis `frontend/`. `JWT_SECRET` doit être présent dans l'env de test (déjà le cas, cf. `platform.routes.test.ts`).

---

## File Structure

- `backend/prisma/schema.prisma` — modèle `Reservation` : `userId` nullable + `title`.
- `backend/prisma/migrations/<ts>_add_reservation_event_fields/` — migration générée.
- `backend/src/services/reservation.service.ts` — ajout `adminCreateReservation`.
- `backend/src/services/__tests__/reservation.service.test.ts` — tests de la nouvelle méthode.
- `backend/src/routes/admin.ts` — ajout route `POST /reservations` + `SLOT_NOT_AVAILABLE` dans `ERROR_STATUS`.
- `backend/src/routes/__tests__/admin.reservations.routes.test.ts` — tests de route (nouveau fichier).
- `frontend/lib/api.ts` — `adminCreateReservation`, type `CreateReservationBody`, `ClubReservation` (`title?`, `user` optionnel).
- `frontend/app/admin/planning/page.tsx` — affichage null-safe + modale de création.
- `frontend/app/admin/reservations/page.tsx` — affichage null-safe (user peut être null).

---

## Task 1 : Migration — `Reservation.userId` nullable + colonne `title`

**Files:**
- Modify: `backend/prisma/schema.prisma:222-243`
- Create: `backend/prisma/migrations/<timestamp>_add_reservation_event_fields/migration.sql` (généré par Prisma)

- [ ] **Step 1 : Rendre `userId` optionnel + ajouter `title` dans le schéma**

Dans `backend/prisma/schema.prisma`, modèle `Reservation`, remplacer les lignes `userId` et la relation `user`, et ajouter `title` :

```prisma
model Reservation {
  id          String            @id @default(cuid())
  resourceId  String            @map("resource_id")
  userId      String?           @map("user_id")
  startTime   DateTime          @map("start_time") @db.Timestamptz
  endTime     DateTime          @map("end_time") @db.Timestamptz
  status      ReservationStatus @default(PENDING)
  type        ReservationType   @default(COURT)
  title       String?
  totalPrice  Decimal           @map("total_price") @db.Decimal(10, 2)
  notes       String?
  cancelledAt DateTime?         @map("cancelled_at")
  createdAt   DateTime          @default(now()) @map("created_at")
  updatedAt   DateTime          @updatedAt @map("updated_at")

  resource Resource  @relation(fields: [resourceId], references: [id], onDelete: Restrict)
  user     User?     @relation(fields: [userId], references: [id], onDelete: Restrict)
  payments Payment[]

  @@index([resourceId, startTime, endTime])
  @@index([status, createdAt])
  @@map("reservations")
}
```

(Le côté `User` reste `reservations Reservation[]` — pas de changement.)

- [ ] **Step 2 : Générer et appliquer la migration**

Run (depuis `backend/`) : `npx prisma migrate dev --name add_reservation_event_fields`
Expected : crée `backend/prisma/migrations/<ts>_add_reservation_event_fields/migration.sql` contenant un `ALTER TABLE "reservations" ALTER COLUMN "user_id" DROP NOT NULL;` et un `ADD COLUMN "title"`, applique sans erreur, régénère le client Prisma.

- [ ] **Step 3 : Vérifier que le backend compile toujours**

Run (depuis `backend/`) : `npx tsc --noEmit`
Expected : aucune erreur (les comparaisons `reservation.userId !== userId` dans `confirmReservation`/`cancelReservation` restent valides avec `string | null`).

- [ ] **Step 4 : Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations
git commit -m "feat(reservations): userId nullable + colonne title (migration additive)"
```

---

## Task 2 : Service `adminCreateReservation` (TDD)

**Files:**
- Test: `backend/src/services/__tests__/reservation.service.test.ts` (ajout d'un `describe`)
- Modify: `backend/src/services/reservation.service.ts` (nouvelle méthode dans la classe)

- [ ] **Step 1 : Écrire les tests (échouent)**

Ajouter, à la fin du `describe('ReservationService', ...)` de `backend/src/services/__tests__/reservation.service.test.ts` (avant l'accolade fermante finale), ce bloc :

```ts
  describe('adminCreateReservation', () => {
    const base = {
      clubId: 'club-demo', resourceId: 'court-1', date: '2026-06-15',
      startTime: '18:00', endTime: '19:00', type: 'EVENT' as const,
    };
    const mockResource = () => prismaMock.resource.findUnique.mockResolvedValue(
      { clubId: 'club-demo', club: { timezone: 'Europe/Paris' } } as any);

    it('crée un événement CONFIRMED sans membre (userId null) + broadcast slot_confirmed', async () => {
      mockResource();
      prismaMock.$transaction.mockImplementation(async (cb: any) => cb(prismaMock));
      prismaMock.reservation.count.mockResolvedValue(0 as any);
      prismaMock.reservation.create.mockResolvedValue({ id: 'r-new', resourceId: 'court-1', startTime: new Date(), endTime: new Date() } as any);

      const res = await service.adminCreateReservation({ ...base, title: 'Maintenance' });

      expect(prismaMock.reservation.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ status: 'CONFIRMED', type: 'EVENT', userId: null, title: 'Maintenance', resourceId: 'court-1' }),
      }));
      expect(sseBroadcast()).toHaveBeenCalledWith('court-1', expect.objectContaining({ type: 'slot_confirmed', reservationId: 'r-new' }));
      expect(res.id).toBe('r-new');
    });

    it('rattache le membre quand memberUserId est fourni et membre du club', async () => {
      mockResource();
      prismaMock.clubMembership.findUnique.mockResolvedValue({ id: 'm1', status: 'ACTIVE' } as any);
      prismaMock.$transaction.mockImplementation(async (cb: any) => cb(prismaMock));
      prismaMock.reservation.count.mockResolvedValue(0 as any);
      prismaMock.reservation.create.mockResolvedValue({ id: 'r-new', resourceId: 'court-1', startTime: new Date(), endTime: new Date() } as any);

      await service.adminCreateReservation({ ...base, type: 'COURT', memberUserId: 'user-9' });

      expect(prismaMock.reservation.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ userId: 'user-9', type: 'COURT' }),
      }));
    });

    it('lève VALIDATION_ERROR si le membre n appartient pas au club', async () => {
      mockResource();
      prismaMock.clubMembership.findUnique.mockResolvedValue(null as any);
      await expect(service.adminCreateReservation({ ...base, memberUserId: 'user-x' })).rejects.toThrow('VALIDATION_ERROR');
    });

    it('lève RESOURCE_NOT_FOUND si la ressource n existe pas', async () => {
      prismaMock.resource.findUnique.mockResolvedValue(null as any);
      await expect(service.adminCreateReservation(base)).rejects.toThrow('RESOURCE_NOT_FOUND');
    });

    it('lève CLUB_MISMATCH si la ressource est d un autre club', async () => {
      prismaMock.resource.findUnique.mockResolvedValue({ clubId: 'autre', club: { timezone: 'Europe/Paris' } } as any);
      await expect(service.adminCreateReservation(base)).rejects.toThrow('CLUB_MISMATCH');
    });

    it('lève VALIDATION_ERROR si fin <= début', async () => {
      mockResource();
      await expect(service.adminCreateReservation({ ...base, startTime: '19:00', endTime: '18:00' })).rejects.toThrow('VALIDATION_ERROR');
    });

    it('lève SLOT_NOT_AVAILABLE si chevauchement', async () => {
      mockResource();
      prismaMock.$transaction.mockImplementation(async (cb: any) => cb(prismaMock));
      prismaMock.reservation.count.mockResolvedValue(1 as any);
      await expect(service.adminCreateReservation(base)).rejects.toThrow('SLOT_NOT_AVAILABLE');
      expect(prismaMock.reservation.create).not.toHaveBeenCalled();
    });
  });
```

- [ ] **Step 2 : Lancer les tests, vérifier l'échec**

Run (depuis `backend/`) : `npx jest reservation.service -t adminCreateReservation`
Expected : FAIL — `service.adminCreateReservation is not a function`.

- [ ] **Step 3 : Implémenter `adminCreateReservation`**

Dans `backend/src/services/reservation.service.ts`, ajouter cette méthode dans la classe `ReservationService` (par ex. juste après `adminCancelReservation`). `Prisma`, `ReservationType`, `DateTime`, `prisma`, `SSEService`, `HOLD_EXPIRY_MS` sont déjà disponibles dans le fichier.

```ts
  /**
   * Création par un gestionnaire depuis le planning : réservation CONFIRMED qui bloque
   * le créneau. Type libre (Terrain/Coaching/Tournoi/Événement), membre optionnel
   * (sinon userId = null), intitulé optionnel. Non soumise aux limites joueur.
   */
  async adminCreateReservation(params: {
    clubId: string;
    resourceId: string;
    date: string;       // YYYY-MM-DD (heure locale du club)
    startTime: string;  // HH:mm
    endTime: string;    // HH:mm
    type: ReservationType;
    title?: string;
    memberUserId?: string;
    price?: number;
  }) {
    const { clubId, resourceId, date, startTime, endTime, type, title, memberUserId, price } = params;

    const resource = await prisma.resource.findUnique({
      where: { id: resourceId },
      select: { clubId: true, club: { select: { timezone: true } } },
    });
    if (!resource)                  throw new Error('RESOURCE_NOT_FOUND');
    if (resource.clubId !== clubId) throw new Error('CLUB_MISMATCH');

    const tz = resource.club.timezone;
    const start = DateTime.fromISO(`${date}T${startTime}`, { zone: tz });
    const end   = DateTime.fromISO(`${date}T${endTime}`, { zone: tz });
    if (!start.isValid || !end.isValid || end <= start) throw new Error('VALIDATION_ERROR');
    if (price !== undefined && (Number.isNaN(price) || price < 0)) throw new Error('VALIDATION_ERROR');

    const startUtc = start.toUTC().toJSDate();
    const endUtc   = end.toUTC().toJSDate();
    const totalPrice = new Prisma.Decimal(price && price > 0 ? price : 0);

    let userId: string | null = null;
    if (memberUserId) {
      const membership = await prisma.clubMembership.findUnique({
        where: { userId_clubId: { userId: memberUserId, clubId } },
      });
      if (!membership) throw new Error('VALIDATION_ERROR');
      userId = memberUserId;
    }

    const tenMinutesAgo = new Date(Date.now() - HOLD_EXPIRY_MS);
    const created = await prisma.$transaction(async (tx) => {
      const conflicts = await tx.reservation.count({
        where: {
          resourceId,
          OR: [
            { status: 'CONFIRMED' },
            { status: 'PENDING', createdAt: { gt: tenMinutesAgo } },
          ],
          startTime: { lt: endUtc },
          endTime:   { gt: startUtc },
        },
      });
      if (conflicts > 0) throw new Error('SLOT_NOT_AVAILABLE');

      return tx.reservation.create({
        data: {
          resourceId,
          userId,
          startTime: startUtc,
          endTime: endUtc,
          status: 'CONFIRMED',
          type,
          title: title?.trim() || null,
          totalPrice,
        },
      });
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      timeout: 10_000,
    });

    SSEService.getInstance().broadcast(resourceId, {
      type: 'slot_confirmed',
      resourceId,
      reservationId: created.id,
      startTime: startUtc.toISOString(),
      endTime: endUtc.toISOString(),
    });

    return created;
  }
```

- [ ] **Step 4 : Lancer les tests, vérifier le succès**

Run (depuis `backend/`) : `npx jest reservation.service -t adminCreateReservation`
Expected : PASS (7 tests).

- [ ] **Step 5 : Commit**

```bash
git add backend/src/services/reservation.service.ts backend/src/services/__tests__/reservation.service.test.ts
git commit -m "feat(reservations): service adminCreateReservation (CONFIRMED + anti-chevauchement)"
```

---

## Task 3 : Route `POST /admin/reservations` (TDD)

**Files:**
- Create: `backend/src/routes/__tests__/admin.reservations.routes.test.ts`
- Modify: `backend/src/routes/admin.ts:20-36` (ERROR_STATUS) et après `backend/src/routes/admin.ts:199-220` (route)

- [ ] **Step 1 : Écrire les tests de route (échouent)**

Créer `backend/src/routes/__tests__/admin.reservations.routes.test.ts` :

```ts
import '../../__mocks__/prisma';
import { prismaMock } from '../../__mocks__/prisma';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../../app';

const SECRET = process.env.JWT_SECRET!;
if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET manquant dans l environnement de test (.env)');
const token = jwt.sign({ id: 'admin-1', email: 'a@x.fr' }, SECRET, { expiresIn: '1h' });
const url = '/api/clubs/club-demo/admin/reservations';
const body = { resourceId: 'court-1', date: '2026-06-15', startTime: '18:00', endTime: '19:00', type: 'EVENT', title: 'Maintenance' };

const asMember = (role = 'OWNER') => prismaMock.clubMember.findUnique.mockResolvedValue({ role } as any);
const okResource = () => prismaMock.resource.findUnique.mockResolvedValue({ clubId: 'club-demo', club: { timezone: 'Europe/Paris' } } as any);

describe('POST /api/clubs/:clubId/admin/reservations', () => {
  it('201 crée un événement', async () => {
    asMember(); okResource();
    prismaMock.$transaction.mockImplementation(async (cb: any) => cb(prismaMock));
    prismaMock.reservation.count.mockResolvedValue(0 as any);
    prismaMock.reservation.create.mockResolvedValue({ id: 'r-new', resourceId: 'court-1', startTime: new Date(), endTime: new Date() } as any);
    const res = await request(app).post(url).set('Authorization', `Bearer ${token}`).send(body);
    expect(res.status).toBe(201);
    expect(res.body.id).toBe('r-new');
  });

  it('403 si l utilisateur n est pas membre du club', async () => {
    prismaMock.clubMember.findUnique.mockResolvedValue(null as any);
    const res = await request(app).post(url).set('Authorization', `Bearer ${token}`).send(body);
    expect(res.status).toBe(403);
  });

  it('400 si type invalide', async () => {
    asMember();
    const res = await request(app).post(url).set('Authorization', `Bearer ${token}`).send({ ...body, type: 'XXX' });
    expect(res.status).toBe(400);
  });

  it('403 CLUB_MISMATCH si la ressource est d un autre club', async () => {
    asMember();
    prismaMock.resource.findUnique.mockResolvedValue({ clubId: 'autre', club: { timezone: 'Europe/Paris' } } as any);
    const res = await request(app).post(url).set('Authorization', `Bearer ${token}`).send(body);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('CLUB_MISMATCH');
  });

  it('409 si le créneau est déjà pris', async () => {
    asMember(); okResource();
    prismaMock.$transaction.mockImplementation(async (cb: any) => cb(prismaMock));
    prismaMock.reservation.count.mockResolvedValue(1 as any);
    const res = await request(app).post(url).set('Authorization', `Bearer ${token}`).send(body);
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('SLOT_NOT_AVAILABLE');
  });
});
```

- [ ] **Step 2 : Lancer, vérifier l'échec**

Run (depuis `backend/`) : `npx jest admin.reservations.routes`
Expected : FAIL — la route renvoie 404 (POST non défini) au lieu de 201.

- [ ] **Step 3 : Ajouter `SLOT_NOT_AVAILABLE` au mapping d'erreurs**

Dans `backend/src/routes/admin.ts`, dans l'objet `ERROR_STATUS` (lignes 20-36), ajouter une entrée :

```ts
  SLOT_NOT_AVAILABLE:    409,
```

- [ ] **Step 4 : Ajouter la route de création**

Dans `backend/src/routes/admin.ts`, juste après le handler `router.get('/reservations', ...)` (qui se termine ligne 220) et avant `router.delete('/reservations/:id', ...)`, insérer :

```ts
router.post('/reservations', async (req: ClubScopedRequest, res: Response, next: NextFunction) => {
  try {
    const { resourceId, date, startTime, endTime, type, title, memberUserId, price } = req.body;
    if (typeof resourceId !== 'string' || !resourceId) return void res.status(400).json({ error: 'resourceId requis' });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(asString(date)))    return void res.status(400).json({ error: 'date doit être YYYY-MM-DD' });
    if (!/^\d{2}:\d{2}$/.test(asString(startTime)) || !/^\d{2}:\d{2}$/.test(asString(endTime))) {
      return void res.status(400).json({ error: 'heures HH:mm requises' });
    }
    if (!RESERVATION_TYPES.includes(type as typeof RESERVATION_TYPES[number])) {
      return void res.status(400).json({ error: 'type invalide' });
    }
    const created = await reservationService.adminCreateReservation({
      clubId:       req.membership!.clubId,
      resourceId, date, startTime, endTime,
      type:         type as typeof RESERVATION_TYPES[number],
      title:        typeof title === 'string' ? title : undefined,
      memberUserId: typeof memberUserId === 'string' && memberUserId ? memberUserId : undefined,
      price:        price !== undefined && price !== null ? Number(price) : undefined,
    });
    res.status(201).json(created);
  } catch (err) { handleError(err, res, next); }
});
```

- [ ] **Step 5 : Lancer, vérifier le succès**

Run (depuis `backend/`) : `npx jest admin.reservations.routes`
Expected : PASS (5 tests).

- [ ] **Step 6 : Commit**

```bash
git add backend/src/routes/admin.ts backend/src/routes/__tests__/admin.reservations.routes.test.ts
git commit -m "feat(reservations): route POST admin/reservations (création depuis le planning)"
```

---

## Task 4 : Front — client API + affichage null-safe (tsc vert)

Ce lot introduit le changement de type (`user` optionnel, `title?`) ET corrige tous ses consommateurs dans le même commit pour que `tsc` reste vert.

**Files:**
- Modify: `frontend/lib/api.ts:124-141` (méthode), `:454-477` (nouveau type), `:505-517` (ClubReservation)
- Modify: `frontend/app/admin/planning/page.tsx` (helper + lignes 298, 306, 342-343)
- Modify: `frontend/app/admin/reservations/page.tsx:126,200`

- [ ] **Step 1 : Ajouter la méthode API et le type de corps**

Dans `frontend/lib/api.ts`, après `adminSetReservationType` (ligne 137) — donc dans le bloc back-office réservations — ajouter :

```ts
  adminCreateReservation: (clubId: string, body: CreateReservationBody, token: string) =>
    request<ClubReservation>(`/api/clubs/${clubId}/admin/reservations`, { method: 'POST', body: JSON.stringify(body) }, token),
```

Et dans la section types, juste après `AdminReservationFilters` (ligne 458), ajouter :

```ts
export interface CreateReservationBody {
  resourceId: string;
  date: string;       // YYYY-MM-DD
  startTime: string;  // HH:mm
  endTime: string;    // HH:mm
  type: ReservationType;
  title?: string;
  memberUserId?: string;
  price?: number;
}
```

- [ ] **Step 2 : Rendre `user` optionnel + ajouter `title` sur `ClubReservation`**

Dans `frontend/lib/api.ts`, remplacer l'interface `ClubReservation` (lignes 505-517) par :

```ts
export interface ClubReservation {
  id: string;
  resourceId: string;
  startTime: string;
  endTime: string;
  status: 'PENDING' | 'CONFIRMED' | 'CANCELLED';
  type: ReservationType;
  title: string | null;
  totalPrice: string;
  paidAmount: string;
  resource: { id: string; name: string };
  user: { firstName: string; lastName: string; email: string } | null;
  payments: Payment[];
}
```

- [ ] **Step 3 : Vérifier que tsc échoue sur les consommateurs**

Run (depuis `frontend/`) : `npx tsc --noEmit`
Expected : FAIL — erreurs « Object is possibly 'null' » sur `frontend/app/admin/planning/page.tsx` (lignes ~298, 306, 342, 343) et `frontend/app/admin/reservations/page.tsx` (~126, 200).

- [ ] **Step 4 : Helper d'étiquette + corrections dans le planning**

Dans `frontend/app/admin/planning/page.tsx`, ajouter ce helper dans le corps du composant (par ex. juste après la ligne `const clubId = club?.id;`) :

```tsx
  // Étiquette d'une entrée : l'intitulé s'il existe, sinon le nom du joueur, sinon « Événement ».
  const labelOf = (r: ClubReservation, short = false) =>
    r.title?.trim()
      ? r.title
      : r.user
        ? (short ? `${r.user.firstName} ${r.user.lastName.slice(0, 1)}.` : `${r.user.firstName} ${r.user.lastName}`)
        : 'Événement';
```

Remplacer la ligne 298 (attribut `title=` du bouton réservation) :

```tsx
                        title={`${labelOf(rv)} · ${TYPE_META[rv.type].label} · ${fmtHM(rv.startTime, tz)}–${fmtHM(rv.endTime, tz)}`}
```

Remplacer la ligne 306 (le `<span>` du nom) :

```tsx
                        <span style={{ fontFamily: th.fontUI, fontSize: 12.5, fontWeight: 700, color: th.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{labelOf(rv, true)}</span>
```

Remplacer le bloc de la modale détail (lignes 341-344) :

```tsx
            <div style={{ marginTop: 14, fontFamily: th.fontUI, fontSize: 14, color: th.text }}>
              {labelOf(selected)}
              {selected.user && <div style={{ fontSize: 12.5, color: th.textFaint }}>{selected.user.email}</div>}
            </div>
```

- [ ] **Step 5 : Corrections dans la page réservations**

Dans `frontend/app/admin/reservations/page.tsx`, remplacer la ligne 126 :

```tsx
                      <td style={cell}>{r.title?.trim() ? r.title : r.user ? `${r.user.firstName} ${r.user.lastName}` : 'Événement'}{r.user && <div style={{ fontSize: 12, color: th.textFaint }}>{r.user.email}</div>}</td>
```

Et la ligne 200 :

```tsx
              {confirmCancel.resource.name} · {confirmCancel.title?.trim() ? confirmCancel.title : confirmCancel.user ? `${confirmCancel.user.firstName} ${confirmCancel.user.lastName}` : 'Événement'}
```

- [ ] **Step 6 : Vérifier que tsc repasse au vert**

Run (depuis `frontend/`) : `npx tsc --noEmit`
Expected : aucune erreur.

- [ ] **Step 7 : Commit**

```bash
git add frontend/lib/api.ts frontend/app/admin/planning/page.tsx frontend/app/admin/reservations/page.tsx
git commit -m "feat(planning): client adminCreateReservation + affichage title/joueur optionnel"
```

---

## Task 5 : Front — modale de création (bouton + sélecteur membre + clic case vide)

**Files:**
- Modify: `frontend/app/admin/planning/page.tsx`

- [ ] **Step 1 : Importer `Member` et `CreateReservationBody` n'est pas requis (corps via objet littéral)**

Modifier la ligne d'import (`frontend/app/admin/planning/page.tsx:3`) pour ajouter `Member` :

```tsx
import { api, AdminResource, ClubReservation, ReservationType, PaymentMethod, Member } from '@/lib/api';
```

- [ ] **Step 2 : Ajouter l'état de la modale de création**

Dans le corps du composant, après la ligne `const [isFs, setIsFs] = useState(false);` (≈ ligne 70), ajouter :

```tsx
  const [members, setMembers]   = useState<Member[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [cType, setCType]       = useState<ReservationType>('EVENT');
  const [cResourceId, setCResId] = useState('');
  const [cDate, setCDate]       = useState(date);
  const [cStart, setCStart]     = useState('18:00');
  const [cEnd, setCEnd]         = useState('19:00');
  const [cTitle, setCTitle]     = useState('');
  const [cMemberId, setCMemberId] = useState<string | null>(null);
  const [cMemberQuery, setCMemberQuery] = useState('');
  const [cPrice, setCPrice]     = useState('');
```

- [ ] **Step 3 : Charger les membres dans `load()`**

Dans `frontend/app/admin/planning/page.tsx`, fonction `load` (lignes 72-87), ajouter `api.adminGetMembers` au `Promise.all` et stocker le résultat :

```tsx
  const load = useCallback(async () => {
    if (!token || !clubId) return;
    setLoading(true);
    try {
      setError(null);
      const [c, res, resv, mem] = await Promise.all([
        api.adminGetClub(clubId, token),
        api.adminGetResources(clubId, token),
        api.adminGetReservations(clubId, { date }, token),
        api.adminGetMembers(clubId, token),
      ]);
      setTz(c.timezone);
      setResources(res.filter((r) => r.isActive));
      setRes(resv.reservations);
      setMembers(mem);
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }, [token, clubId, date]);
```

- [ ] **Step 4 : Ajouter `openCreate` et `submitCreate`**

Après la fonction `addPayment` (≈ ligne 191), ajouter :

```tsx
  const openCreate = (prefill?: { resourceId?: string; startHour?: number }) => {
    const sh = Math.max(minOpen, Math.min(prefill?.startHour ?? minOpen, maxClose - 1));
    setCType('EVENT');
    setCResId(prefill?.resourceId ?? resources[0]?.id ?? '');
    setCDate(date);
    setCStart(`${String(sh).padStart(2, '0')}:00`);
    setCEnd(`${String(Math.min(sh + 1, 23)).padStart(2, '0')}:00`);
    setCTitle(''); setCMemberId(null); setCMemberQuery(''); setCPrice('');
    setError(null);
    setCreateOpen(true);
  };

  const submitCreate = async () => {
    if (!token || !clubId) return;
    if (!cResourceId) { setError('Choisis un terrain.'); return; }
    if (cEnd <= cStart) { setError('L’heure de fin doit être après le début.'); return; }
    setBusy(true);
    try {
      setError(null);
      await api.adminCreateReservation(clubId, {
        resourceId: cResourceId, date: cDate, startTime: cStart, endTime: cEnd,
        type: cType,
        title: cTitle.trim() || undefined,
        memberUserId: cMemberId ?? undefined,
        price: cPrice ? Number(cPrice) : undefined,
      }, token);
      setCreateOpen(false);
      await load();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };

  const memberMatches = cMemberQuery.trim().length > 0 && !cMemberId
    ? members.filter((m) => `${m.firstName} ${m.lastName} ${m.email}`.toLowerCase().includes(cMemberQuery.toLowerCase())).slice(0, 6)
    : [];
```

- [ ] **Step 5 : Ajouter le bouton « + Ajouter » dans l'en-tête**

Dans l'en-tête (lignes 197-200), ajouter un bouton avant les deux boutons existants :

```tsx
        <div style={{ display: 'flex', gap: 8 }}>
          <Btn type="button" icon="plus" onClick={() => openCreate()}>Ajouter</Btn>
          <button type="button" onClick={() => setCollapsed(!collapsed)} style={chromeBtn}>{collapsed ? 'Afficher le menu' : 'Masquer le menu'}</button>
          <button type="button" onClick={toggleFs} style={chromeBtn}>⛶ {isFs ? 'Quitter' : 'Plein écran'}</button>
        </div>
```

- [ ] **Step 6 : Rendre les lignes terrain cliquables (clic case vide)**

Sur le `<div>` de chaque ligne terrain (ligne 279, `key={r.id}` avec `position: 'relative', height: rowH`), ajouter un `onClick` et un curseur. Remplacer l'ouverture de ce div par :

```tsx
                <div key={r.id}
                  onClick={(e) => {
                    if (e.target !== e.currentTarget) return; // ignore les clics sur réservations / lignes
                    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                    const h = Math.floor((e.clientX - rect.left) / colW) + minOpen;
                    openCreate({ resourceId: r.id, startHour: h });
                  }}
                  style={{ position: 'relative', height: rowH, borderTop: `1px solid ${th.line}`, cursor: 'copy' }}>
```

(Les boutons réservation sont des enfants : `e.target !== e.currentTarget` les ignore, et leur propre `onClick` ouvre la modale détail comme avant.)

- [ ] **Step 7 : Ajouter la modale de création (avant la `</div>` finale, après la modale détail)**

Juste avant le dernier `</div>` du composant (après le bloc `{selected && (...)}`, ligne ≈ 399), insérer :

```tsx
      {createOpen && (
        <div onClick={() => setCreateOpen(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div onClick={(e) => e.stopPropagation()}
            style={{ width: '100%', maxWidth: 460, background: th.surface, borderRadius: 18, boxShadow: th.shadow, padding: 22, fontFamily: th.fontUI, maxHeight: '90vh', overflow: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontFamily: th.fontDisplay, fontWeight: 600, fontSize: 21, color: th.text }}>Nouvel événement</div>
              <button onClick={() => setCreateOpen(false)} aria-label="Fermer" style={{ border: 'none', background: th.surface2, cursor: 'pointer', borderRadius: 9, width: 30, height: 30, color: th.textMute, fontSize: 16 }}>✕</button>
            </div>

            {/* type */}
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, color: th.textMute, marginBottom: 8 }}>Type</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {TYPE_ORDER.map((t) => {
                  const on = cType === t;
                  const c = TYPE_META[t].color;
                  return (
                    <button key={t} type="button" onClick={() => setCType(t)}
                      style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer', border: `1.5px solid ${on ? c : th.line}`, background: on ? tint(c) : 'transparent', borderRadius: 10, padding: '7px 12px', fontFamily: th.fontUI, fontSize: 13, fontWeight: 600, color: th.text }}>
                      <span style={{ width: 10, height: 10, borderRadius: 3, background: c }} />{TYPE_META[t].label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* terrain + date */}
            <div style={{ marginTop: 14, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <label style={{ fontSize: 12, color: th.textMute, display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 160 }}>Terrain
                <select value={cResourceId} onChange={(e) => setCResId(e.target.value)} style={{ border: `1px solid ${th.line}`, background: th.bg, color: th.text, borderRadius: 8, padding: '8px 10px', fontFamily: th.fontUI, fontSize: 14 }}>
                  {resources.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </label>
              <label style={{ fontSize: 12, color: th.textMute, display: 'flex', flexDirection: 'column', gap: 4 }}>Date
                <input type="date" value={cDate} onChange={(e) => setCDate(e.target.value)} style={{ border: `1px solid ${th.line}`, background: th.bg, color: th.text, borderRadius: 8, padding: '7px 10px', fontFamily: th.fontUI, fontSize: 14 }} />
              </label>
            </div>

            {/* heures */}
            <div style={{ marginTop: 12, display: 'flex', gap: 10 }}>
              <label style={{ fontSize: 12, color: th.textMute, display: 'flex', flexDirection: 'column', gap: 4 }}>Début
                <input type="time" value={cStart} onChange={(e) => setCStart(e.target.value)} style={{ border: `1px solid ${th.line}`, background: th.bg, color: th.text, borderRadius: 8, padding: '7px 10px', fontFamily: th.fontUI, fontSize: 14 }} />
              </label>
              <label style={{ fontSize: 12, color: th.textMute, display: 'flex', flexDirection: 'column', gap: 4 }}>Fin
                <input type="time" value={cEnd} onChange={(e) => setCEnd(e.target.value)} style={{ border: `1px solid ${th.line}`, background: th.bg, color: th.text, borderRadius: 8, padding: '7px 10px', fontFamily: th.fontUI, fontSize: 14 }} />
              </label>
            </div>

            {/* intitulé */}
            <label style={{ marginTop: 12, fontSize: 12, color: th.textMute, display: 'flex', flexDirection: 'column', gap: 4 }}>Intitulé (optionnel)
              <input type="text" value={cTitle} onChange={(e) => setCTitle(e.target.value)} placeholder="Ex. Maintenance, Tournoi P100…" style={{ border: `1px solid ${th.line}`, background: th.bg, color: th.text, borderRadius: 8, padding: '8px 10px', fontFamily: th.fontUI, fontSize: 14 }} />
            </label>

            {/* membre (optionnel) */}
            <div style={{ marginTop: 12, position: 'relative' }}>
              <div style={{ fontSize: 12, color: th.textMute, marginBottom: 4 }}>Membre (optionnel)</div>
              {cMemberId ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, border: `1px solid ${th.line}`, borderRadius: 8, padding: '8px 10px' }}>
                  <span style={{ flex: 1, fontFamily: th.fontUI, fontSize: 14, color: th.text }}>{cMemberQuery}</span>
                  <button type="button" onClick={() => { setCMemberId(null); setCMemberQuery(''); }} style={{ border: 'none', background: th.surface2, cursor: 'pointer', borderRadius: 8, padding: '3px 8px', color: th.textMute, fontSize: 12 }}>Retirer</button>
                </div>
              ) : (
                <input type="text" value={cMemberQuery} onChange={(e) => setCMemberQuery(e.target.value)} placeholder="Rechercher un membre…" style={{ width: '100%', boxSizing: 'border-box', border: `1px solid ${th.line}`, background: th.bg, color: th.text, borderRadius: 8, padding: '8px 10px', fontFamily: th.fontUI, fontSize: 14 }} />
              )}
              {memberMatches.length > 0 && (
                <div style={{ position: 'absolute', left: 0, right: 0, top: '100%', zIndex: 10, background: th.surface, border: `1px solid ${th.line}`, borderRadius: 8, marginTop: 4, overflow: 'hidden', boxShadow: th.shadowSoft }}>
                  {memberMatches.map((m) => (
                    <button key={m.userId} type="button"
                      onClick={() => { setCMemberId(m.userId); setCMemberQuery(`${m.firstName} ${m.lastName}`); }}
                      style={{ display: 'block', width: '100%', textAlign: 'left', border: 'none', background: 'transparent', cursor: 'pointer', padding: '8px 10px', fontFamily: th.fontUI, fontSize: 13.5, color: th.text }}>
                      {m.firstName} {m.lastName} <span style={{ color: th.textFaint }}>· {m.email}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* prix + valider */}
            <div style={{ marginTop: 14, display: 'flex', alignItems: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
              <label style={{ fontSize: 12, color: th.textMute, display: 'flex', flexDirection: 'column', gap: 4 }}>Prix €
                <input type="number" min={0} step="0.5" value={cPrice} onChange={(e) => setCPrice(e.target.value)} placeholder="0" style={{ border: `1px solid ${th.line}`, background: th.bg, color: th.text, borderRadius: 8, padding: '7px 10px', fontFamily: th.fontUI, fontSize: 14, width: 90 }} />
              </label>
              <div style={{ flex: 1 }} />
              <Btn type="button" icon="check" onClick={submitCreate} disabled={busy}>{busy ? '…' : 'Créer'}</Btn>
            </div>
          </div>
        </div>
      )}
```

- [ ] **Step 8 : Vérifier la compilation**

Run (depuis `frontend/`) : `npx tsc --noEmit`
Expected : aucune erreur.

- [ ] **Step 9 : Vérification navigateur manuelle**

Lancer le dev (`npm run dev` back + front), se connecter en admin, aller sur `/admin/planning` :
- Le bouton **« + Ajouter »** ouvre la modale ; créer un **Événement** sans membre avec un intitulé → il apparaît sur la timeline avec l'intitulé.
- Cliquer une **case vide** d'une ligne terrain → la modale s'ouvre pré-remplie (terrain + heure).
- Créer un **Terrain** en rattachant un **membre** → il apparaît au nom du membre.
- Vérifier qu'un **chevauchement** est refusé (message d'erreur).
- Côté joueur, le créneau créé est **indisponible**.

- [ ] **Step 10 : Commit**

```bash
git add frontend/app/admin/planning/page.tsx
git commit -m "feat(planning): modale de création d'événements (bouton + clic case vide + membre)"
```

---

## Task 6 : Vérification globale

**Files:** aucun (vérification).

- [ ] **Step 1 : Suite backend complète**

Run (depuis `backend/`) : `npx tsc --noEmit && npx jest`
Expected : tsc clean ; tous les tests passent (les ~77 existants + 7 service + 5 route).

- [ ] **Step 2 : Suite frontend complète**

Run (depuis `frontend/`) : `npx tsc --noEmit && npx jest`
Expected : tsc clean ; les tests existants (11) passent.

- [ ] **Step 3 : Note de déploiement (pas de commit)**

Au prochain `bash deploy/deploy.sh` sur la VM, `prisma migrate deploy` appliquera la migration `add_reservation_event_fields` automatiquement. Rien de manuel.

---

## Self-Review

**Spec coverage :** création des 4 types (Task 2 service + Task 5 UI sélecteur de type) ✓ ; blocage du créneau via `CONFIRMED` (Task 2) ✓ ; membre optionnel / `userId` null (Task 1+2) ✓ ; intitulé `title` (Task 1+2+4) ✓ ; bouton + clic case vide (Task 5) ✓ ; route `POST` (Task 3) ✓ ; anti-chevauchement Serializable (Task 2) ✓ ; bypass limites joueur (pas d'appel à `assertMembershipAndWindow` dans `adminCreateReservation`) ✓ ; conversion fuseau via `club.timezone` (Task 2) ✓ ; affichage `title`/joueur null (Task 4) ✓ ; tests service/route/manuel (Tasks 2,3,5) ✓ ; hors périmètre récurrence (non implémentée) ✓.

**Placeholder scan :** aucun TODO/TBD ; chaque step de code contient le code complet ; pas de « similaire à ».

**Type consistency :** `adminCreateReservation(params)` (service) ↔ corps route ↔ `CreateReservationBody` (front) alignés sur `{ resourceId, date, startTime, endTime, type, title?, memberUserId?, price? }`. `ClubReservation.user` rendu `| null` et tous les consommateurs (planning ×4, reservations ×2) corrigés dans Task 4. `labelOf` défini avant usage dans le planning.
