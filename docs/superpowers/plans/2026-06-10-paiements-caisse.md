# Caisse & carnets (v1) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permettre à l'accueil du club de gérer tous les paiements en caisse (espèces/carte/ticket CE) et de vendre des formules prépayées (carnet d'entrées, porte-monnaie €) que le joueur peut consommer en caisse ou à la réservation en ligne ; ajouter un récap de caisse journalier et le suivi de remboursement des tickets CE.

**Architecture:** Migration Prisma additive (`PackageTemplate`, `MemberPackage`, `Payment` étendu avec `reservationId` optionnel + champs voucher + `clubId` backfillé). Nouveau `PackageService` (offres, vente, consommation concurrent-sûre par update conditionnel, caisse du jour, vouchers). `reservationService.addPayment` et `confirmReservation` étendus — la consommation d'un package s'insère dans les transactions existantes. Frontend : pages `/admin/packages` et `/admin/caisse`, panneau « Encaisser » du planning enrichi, option « payer avec mon carnet » dans BookingModal.

**Tech Stack:** Express 5 + Prisma 7 (PrismaPg adapter) + Luxon, Jest + jest-mock-extended (mocks dans `backend/src/__mocks__/`), Next.js 16 + React 19, tests RTL dans `frontend/__tests__/`.

**Décisions de design (écarts/précisions vs brief) :**
- `Payment.clubId` (nullable, backfillé depuis `reservation→resource`) est ajouté pour que la caisse du jour soit une simple requête `WHERE club_id AND created_at` — les paiements de vente de carnet n'ont pas de réservation, il faut un rattachement club direct.
- « Soldes dans le profil joueur » (brief item 6) : en v1 les soldes s'affichent sur la page **Réserver** (chips sous la nav quand des packages existent) et dans le **BookingModal** au moment de payer — il n'existe pas de page profil joueur standalone.
- Le « reste dû du jour » de `/admin/caisse` réutilise `GET /admin/reservations?date=` (summary.outstanding existant) — pas de duplication backend.
- Pas de modification du seed (les offres se créent via l'UI).

**Branche de travail :** `feat/paiements-caisse` (créer avant la Task 1 : `git checkout -b feat/paiements-caisse`).

---

### Task 1: Schéma Prisma + migration additive `add_packages_caisse`

**Files:**
- Modify: `backend/prisma/schema.prisma`

- [ ] **Step 1: Étendre l'enum PaymentMethod et ajouter les nouveaux enums**

Dans `backend/prisma/schema.prisma`, remplacer l'enum `PaymentMethod` (ligne 34) par :

```prisma
enum PaymentMethod {
  CASH
  CARD
  TRANSFER
  ONLINE
  OTHER
  VOUCHER      // ticket CE / chèque sport
  PACK_CREDIT  // consommation d'1 entrée d'un carnet
  WALLET       // débit du porte-monnaie €
}

/// Type d'offre prépayée : carnet d'entrées ou porte-monnaie €.
enum PackageKind {
  ENTRIES
  WALLET
}

/// Suivi de remboursement d'un ticket CE / chèque sport.
enum VoucherStatus {
  PENDING_REIMBURSEMENT
  REIMBURSED
}
```

- [ ] **Step 2: Ajouter les modèles PackageTemplate et MemberPackage**

Après le modèle `Payment`, ajouter :

```prisma
/// Offre prépayée vendue par un club (carnet d'entrées ou porte-monnaie €).
model PackageTemplate {
  id           String      @id @default(cuid())
  clubId       String      @map("club_id")
  kind         PackageKind
  name         String
  price        Decimal     @db.Decimal(10, 2)                       // prix de vente
  entriesCount Int?        @map("entries_count")                    // si ENTRIES
  walletAmount Decimal?    @map("wallet_amount") @db.Decimal(10, 2) // si WALLET : montant crédité
  validityDays Int?        @map("validity_days")                    // null = sans expiration
  isActive     Boolean     @default(true) @map("is_active")
  createdAt    DateTime    @default(now()) @map("created_at")
  updatedAt    DateTime    @updatedAt @map("updated_at")

  club           Club            @relation(fields: [clubId], references: [id], onDelete: Cascade)
  memberPackages MemberPackage[]

  @@index([clubId])
  @@map("package_templates")
}

/// Achat d'une offre par un joueur : le solde vivant (crédits ou €).
model MemberPackage {
  id               String    @id @default(cuid())
  clubId           String    @map("club_id")
  userId           String    @map("user_id")
  templateId       String    @map("template_id")
  kind             PackageKind
  creditsTotal     Int?      @map("credits_total")
  creditsRemaining Int?      @map("credits_remaining")
  amountTotal      Decimal?  @map("amount_total") @db.Decimal(10, 2)
  amountRemaining  Decimal?  @map("amount_remaining") @db.Decimal(10, 2)
  purchasedAt      DateTime  @default(now()) @map("purchased_at")
  expiresAt        DateTime? @map("expires_at")

  club     Club            @relation(fields: [clubId], references: [id], onDelete: Cascade)
  user     User            @relation(fields: [userId], references: [id], onDelete: Cascade)
  template PackageTemplate @relation(fields: [templateId], references: [id], onDelete: Restrict)
  salePayments        Payment[] @relation("PackageSale")
  consumptionPayments Payment[] @relation("PackageConsumption")

  @@index([clubId, userId])
  @@map("member_packages")
}
```

- [ ] **Step 3: Étendre Payment et brancher les relations inverses**

Remplacer le modèle `Payment` par :

```prisma
/// Encaissement manuel : sur une réservation (reservationId) OU vente d'un
/// package (memberPackageId). clubId est toujours renseigné pour les nouveaux
/// paiements (backfillé pour l'historique) — base du récap de caisse.
model Payment {
  id              String         @id @default(cuid())
  reservationId   String?        @map("reservation_id")
  clubId          String?        @map("club_id")
  amount          Decimal        @db.Decimal(10, 2)
  method          PaymentMethod  @default(CASH)
  payerName       String?        @map("payer_name")
  note            String?
  memberPackageId String?        @map("member_package_id") // = vente de ce package
  sourcePackageId String?        @map("source_package_id") // = consommation de ce package
  voucherRef      String?        @map("voucher_ref")
  voucherIssuer   String?        @map("voucher_issuer")
  voucherStatus   VoucherStatus? @map("voucher_status")
  createdAt       DateTime       @default(now()) @map("created_at")

  reservation   Reservation?   @relation(fields: [reservationId], references: [id], onDelete: Cascade)
  memberPackage MemberPackage? @relation("PackageSale", fields: [memberPackageId], references: [id], onDelete: SetNull)
  sourcePackage MemberPackage? @relation("PackageConsumption", fields: [sourcePackageId], references: [id], onDelete: SetNull)

  @@index([reservationId])
  @@index([clubId, createdAt])
  @@map("payments")
}
```

Puis ajouter les relations inverses : dans `model Club` (après `tournaments Tournament[]`) :

```prisma
  packageTemplates PackageTemplate[]
  memberPackages   MemberPackage[]
```

et dans `model User` (après `emailVerification EmailVerification?`) :

```prisma
  memberPackages MemberPackage[]
```

- [ ] **Step 4: Générer la migration sans l'appliquer, ajouter le backfill**

Dans `backend/` :

```bash
npx prisma migrate dev --name add_packages_caisse --create-only
```

Ouvrir le fichier généré `backend/prisma/migrations/<timestamp>_add_packages_caisse/migration.sql` et ajouter à la fin :

```sql
-- Backfill du club des paiements existants (via réservation → ressource).
UPDATE "payments" p
SET "club_id" = res."club_id"
FROM "reservations" r
JOIN "resources" res ON res."id" = r."resource_id"
WHERE p."reservation_id" = r."id" AND p."club_id" IS NULL;
```

- [ ] **Step 5: Appliquer la migration et vérifier**

```bash
npx prisma migrate dev
```

Expected: migration appliquée, client Prisma régénéré sans erreur. Vérifier : `npx prisma validate` → « The schema … is valid ».

- [ ] **Step 6: Vérifier que les tests existants passent toujours**

```bash
npm test
```

Expected: PASS (aucun test ne dépend du caractère obligatoire de `Payment.reservationId`).

- [ ] **Step 7: Commit**

```bash
git add prisma/
git commit -m "feat(caisse): schema packages + paiement etendu (migration add_packages_caisse)"
```

---

### Task 2: PackageService — gestion des offres (templates)

**Files:**
- Create: `backend/src/services/package.service.ts`
- Test: `backend/src/services/__tests__/package.service.test.ts`

- [ ] **Step 1: Écrire les tests qui échouent**

Créer `backend/src/services/__tests__/package.service.test.ts` :

```typescript
import '../../__mocks__/prisma';
import { prismaMock } from '../../__mocks__/prisma';
import { PackageService } from '../package.service';

describe('PackageService — offres (templates)', () => {
  let service: PackageService;
  beforeEach(() => { service = new PackageService(); });

  it('crée une offre carnet (ENTRIES) avec entriesCount', async () => {
    prismaMock.packageTemplate.create.mockResolvedValue({ id: 'tpl-1' } as any);
    await service.createTemplate('club-1', { kind: 'ENTRIES', name: '10 entrées', price: 200, entriesCount: 10 });
    expect(prismaMock.packageTemplate.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ clubId: 'club-1', kind: 'ENTRIES', entriesCount: 10, walletAmount: null }),
    }));
  });

  it('crée une offre porte-monnaie (WALLET) avec walletAmount', async () => {
    prismaMock.packageTemplate.create.mockResolvedValue({ id: 'tpl-2' } as any);
    await service.createTemplate('club-1', { kind: 'WALLET', name: 'Avoir 200 €', price: 180, walletAmount: 200, validityDays: 365 });
    expect(prismaMock.packageTemplate.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ kind: 'WALLET', entriesCount: null, validityDays: 365 }),
    }));
  });

  it('refuse un carnet sans entriesCount', async () => {
    await expect(service.createTemplate('club-1', { kind: 'ENTRIES', name: 'x', price: 200 }))
      .rejects.toThrow('VALIDATION_ERROR');
  });

  it('refuse un porte-monnaie sans walletAmount', async () => {
    await expect(service.createTemplate('club-1', { kind: 'WALLET', name: 'x', price: 180 }))
      .rejects.toThrow('VALIDATION_ERROR');
  });

  it('refuse un prix nul ou négatif', async () => {
    await expect(service.createTemplate('club-1', { kind: 'ENTRIES', name: 'x', price: 0, entriesCount: 10 }))
      .rejects.toThrow('VALIDATION_ERROR');
  });

  it('updateTemplate refuse une offre d’un autre club', async () => {
    prismaMock.packageTemplate.findUnique.mockResolvedValue({ id: 'tpl-1', clubId: 'autre-club' } as any);
    await expect(service.updateTemplate('tpl-1', 'club-1', { isActive: false }))
      .rejects.toThrow('TEMPLATE_NOT_FOUND');
  });

  it('updateTemplate ne modifie que name/price/validityDays/isActive', async () => {
    prismaMock.packageTemplate.findUnique.mockResolvedValue({ id: 'tpl-1', clubId: 'club-1' } as any);
    prismaMock.packageTemplate.update.mockResolvedValue({ id: 'tpl-1' } as any);
    await service.updateTemplate('tpl-1', 'club-1', { name: 'Nouveau nom', isActive: false });
    const data = prismaMock.packageTemplate.update.mock.calls[0][0].data as Record<string, unknown>;
    expect(data).not.toHaveProperty('kind');
    expect(data).not.toHaveProperty('entriesCount');
  });
});
```

- [ ] **Step 2: Vérifier l'échec**

```bash
npm test -- package.service
```

Expected: FAIL — `Cannot find module '../package.service'`.

- [ ] **Step 3: Implémenter la partie templates de PackageService**

Créer `backend/src/services/package.service.ts` :

```typescript
import { Prisma, PackageKind, PaymentMethod, VoucherStatus } from '@prisma/client';
import { DateTime } from 'luxon';
import { prisma } from '../db/prisma';

/** Méthodes acceptées pour encaisser la VENTE d'une offre (pas de prépayé sur prépayé). */
const SALE_METHODS = ['CASH', 'CARD', 'TRANSFER', 'VOUCHER', 'OTHER'] as const;

export class PackageService {
  // --- Offres (templates) ---

  async listTemplates(clubId: string) {
    return prisma.packageTemplate.findMany({ where: { clubId }, orderBy: { createdAt: 'asc' } });
  }

  async createTemplate(clubId: string, body: {
    kind?: string; name?: string; price?: number;
    entriesCount?: number; walletAmount?: number; validityDays?: number | null;
  }) {
    const { kind, name, price, entriesCount, walletAmount, validityDays } = body;
    if (kind !== 'ENTRIES' && kind !== 'WALLET')                          throw new Error('VALIDATION_ERROR');
    if (!name?.trim())                                                    throw new Error('VALIDATION_ERROR');
    if (typeof price !== 'number' || isNaN(price) || price <= 0)          throw new Error('VALIDATION_ERROR');
    if (kind === 'ENTRIES' && (!Number.isInteger(entriesCount) || (entriesCount as number) <= 0))
                                                                          throw new Error('VALIDATION_ERROR');
    if (kind === 'WALLET' && (typeof walletAmount !== 'number' || isNaN(walletAmount) || walletAmount <= 0))
                                                                          throw new Error('VALIDATION_ERROR');
    if (validityDays != null && (!Number.isInteger(validityDays) || validityDays <= 0))
                                                                          throw new Error('VALIDATION_ERROR');

    return prisma.packageTemplate.create({
      data: {
        clubId,
        kind: kind as PackageKind,
        name: name.trim(),
        price: new Prisma.Decimal(price),
        entriesCount: kind === 'ENTRIES' ? (entriesCount as number) : null,
        walletAmount: kind === 'WALLET' ? new Prisma.Decimal(walletAmount as number) : null,
        validityDays: validityDays ?? null,
      },
    });
  }

  /** kind/entriesCount/walletAmount sont immuables (des soldes vendus y réfèrent). */
  async updateTemplate(id: string, clubId: string, body: {
    name?: string; price?: number; validityDays?: number | null; isActive?: boolean;
  }) {
    const tpl = await prisma.packageTemplate.findUnique({ where: { id } });
    if (!tpl || tpl.clubId !== clubId) throw new Error('TEMPLATE_NOT_FOUND');

    const data: Prisma.PackageTemplateUpdateInput = {};
    if (body.name !== undefined) {
      if (!body.name.trim()) throw new Error('VALIDATION_ERROR');
      data.name = body.name.trim();
    }
    if (body.price !== undefined) {
      if (typeof body.price !== 'number' || isNaN(body.price) || body.price <= 0) throw new Error('VALIDATION_ERROR');
      data.price = new Prisma.Decimal(body.price);
    }
    if (body.validityDays !== undefined) {
      if (body.validityDays != null && (!Number.isInteger(body.validityDays) || body.validityDays <= 0)) throw new Error('VALIDATION_ERROR');
      data.validityDays = body.validityDays;
    }
    if (body.isActive !== undefined) data.isActive = body.isActive;

    return prisma.packageTemplate.update({ where: { id }, data });
  }
}
```

- [ ] **Step 4: Vérifier que les tests passent**

```bash
npm test -- package.service
```

Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/services/package.service.ts src/services/__tests__/package.service.test.ts
git commit -m "feat(caisse): PackageService - CRUD des offres prepayees"
```

---

### Task 3: PackageService — vente en caisse

**Files:**
- Modify: `backend/src/services/package.service.ts`
- Test: `backend/src/services/__tests__/package.service.test.ts`

- [ ] **Step 1: Écrire les tests qui échouent**

Ajouter dans `package.service.test.ts` :

```typescript
describe('PackageService — vente en caisse', () => {
  let service: PackageService;
  beforeEach(() => {
    service = new PackageService();
    prismaMock.$transaction.mockImplementation(async (fn: any) => fn(prismaMock));
  });

  const tplEntries = { id: 'tpl-1', clubId: 'club-1', kind: 'ENTRIES', name: '10 entrées', price: 200, entriesCount: 10, walletAmount: null, validityDays: null, isActive: true };

  it('vend un carnet : crée le MemberPackage + le Payment de vente dans une transaction', async () => {
    prismaMock.packageTemplate.findUnique.mockResolvedValue(tplEntries as any);
    prismaMock.clubMembership.findUnique.mockResolvedValue({ id: 'mb-1' } as any);
    prismaMock.memberPackage.create.mockResolvedValue({ id: 'pkg-1', kind: 'ENTRIES' } as any);
    prismaMock.payment.create.mockResolvedValue({ id: 'pay-1' } as any);

    const out = await service.sellPackage('club-1', 'user-1', { templateId: 'tpl-1', method: 'CARD' });

    expect(prismaMock.memberPackage.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ clubId: 'club-1', userId: 'user-1', creditsTotal: 10, creditsRemaining: 10, amountTotal: null }),
    }));
    expect(prismaMock.payment.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ clubId: 'club-1', memberPackageId: 'pkg-1', method: 'CARD' }),
    }));
    expect(out.package.id).toBe('pkg-1');
  });

  it('vend un porte-monnaie avec expiration : amountRemaining = walletAmount, expiresAt posé', async () => {
    prismaMock.packageTemplate.findUnique.mockResolvedValue({ ...tplEntries, id: 'tpl-2', kind: 'WALLET', entriesCount: null, walletAmount: 200, validityDays: 365 } as any);
    prismaMock.clubMembership.findUnique.mockResolvedValue({ id: 'mb-1' } as any);
    prismaMock.memberPackage.create.mockResolvedValue({ id: 'pkg-2', kind: 'WALLET' } as any);
    prismaMock.payment.create.mockResolvedValue({ id: 'pay-2' } as any);

    await service.sellPackage('club-1', 'user-1', { templateId: 'tpl-2' });

    const data = prismaMock.memberPackage.create.mock.calls[0][0].data as any;
    expect(data.creditsTotal).toBeNull();
    expect(Number(data.amountRemaining)).toBe(200);
    expect(data.expiresAt).toBeInstanceOf(Date);
  });

  it('vente payée en ticket CE : exige voucherRef et pose voucherStatus', async () => {
    prismaMock.packageTemplate.findUnique.mockResolvedValue(tplEntries as any);
    prismaMock.clubMembership.findUnique.mockResolvedValue({ id: 'mb-1' } as any);

    await expect(service.sellPackage('club-1', 'user-1', { templateId: 'tpl-1', method: 'VOUCHER' }))
      .rejects.toThrow('VALIDATION_ERROR');

    prismaMock.memberPackage.create.mockResolvedValue({ id: 'pkg-1' } as any);
    prismaMock.payment.create.mockResolvedValue({ id: 'pay-1' } as any);
    await service.sellPackage('club-1', 'user-1', { templateId: 'tpl-1', method: 'VOUCHER', voucherRef: 'ANCV-123', voucherIssuer: 'ANCV' });
    expect(prismaMock.payment.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ method: 'VOUCHER', voucherRef: 'ANCV-123', voucherStatus: 'PENDING_REIMBURSEMENT' }),
    }));
  });

  it('refuse une offre inactive ou d’un autre club', async () => {
    prismaMock.packageTemplate.findUnique.mockResolvedValue({ ...tplEntries, isActive: false } as any);
    await expect(service.sellPackage('club-1', 'user-1', { templateId: 'tpl-1' }))
      .rejects.toThrow('TEMPLATE_NOT_FOUND');
  });

  it('refuse si l’acheteur n’est pas membre du club', async () => {
    prismaMock.packageTemplate.findUnique.mockResolvedValue(tplEntries as any);
    prismaMock.clubMembership.findUnique.mockResolvedValue(null as any);
    await expect(service.sellPackage('club-1', 'user-1', { templateId: 'tpl-1' }))
      .rejects.toThrow('MEMBER_NOT_FOUND');
  });
});
```

- [ ] **Step 2: Vérifier l'échec**

```bash
npm test -- package.service
```

Expected: FAIL — `service.sellPackage is not a function`.

- [ ] **Step 3: Implémenter sellPackage**

Ajouter dans la classe `PackageService` :

```typescript
  // --- Vente en caisse ---

  /**
   * Vend une offre à un membre : MemberPackage (solde initial) + Payment de
   * vente dans la même transaction. La vente s'encaisse en CASH/CARD/TRANSFER/
   * VOUCHER/OTHER (jamais en prépayé).
   */
  async sellPackage(clubId: string, userId: string, body: {
    templateId?: string; method?: string; payerName?: string;
    voucherRef?: string; voucherIssuer?: string;
  }) {
    const tpl = await prisma.packageTemplate.findUnique({ where: { id: body.templateId ?? '' } });
    if (!tpl || tpl.clubId !== clubId || !tpl.isActive) throw new Error('TEMPLATE_NOT_FOUND');

    const membership = await prisma.clubMembership.findUnique({
      where: { userId_clubId: { userId, clubId } },
    });
    if (!membership) throw new Error('MEMBER_NOT_FOUND');

    const method = (SALE_METHODS.includes(body.method as typeof SALE_METHODS[number])
      ? body.method : 'CASH') as PaymentMethod;
    if (method === 'VOUCHER' && !body.voucherRef?.trim()) throw new Error('VALIDATION_ERROR');

    const expiresAt = tpl.validityDays
      ? new Date(Date.now() + tpl.validityDays * 86_400_000)
      : null;

    return prisma.$transaction(async (tx) => {
      const pkg = await tx.memberPackage.create({
        data: {
          clubId, userId, templateId: tpl.id, kind: tpl.kind,
          creditsTotal:     tpl.kind === 'ENTRIES' ? tpl.entriesCount : null,
          creditsRemaining: tpl.kind === 'ENTRIES' ? tpl.entriesCount : null,
          amountTotal:      tpl.kind === 'WALLET' ? tpl.walletAmount : null,
          amountRemaining:  tpl.kind === 'WALLET' ? tpl.walletAmount : null,
          expiresAt,
        },
      });
      const payment = await tx.payment.create({
        data: {
          clubId,
          amount: tpl.price,
          method,
          memberPackageId: pkg.id,
          payerName: body.payerName?.trim() || null,
          note: `Vente ${tpl.name}`,
          voucherRef:    method === 'VOUCHER' ? body.voucherRef!.trim() : null,
          voucherIssuer: method === 'VOUCHER' ? body.voucherIssuer?.trim() || null : null,
          voucherStatus: method === 'VOUCHER' ? 'PENDING_REIMBURSEMENT' : null,
        },
      });
      return { package: pkg, payment };
    });
  }
```

- [ ] **Step 4: Vérifier que les tests passent**

```bash
npm test -- package.service
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/package.service.ts src/services/__tests__/package.service.test.ts
git commit -m "feat(caisse): vente d'une offre en caisse (package + paiement transactionnels)"
```

---

### Task 4: PackageService — consommation concurrent-sûre + soldes

**Files:**
- Modify: `backend/src/services/package.service.ts`
- Test: `backend/src/services/__tests__/package.service.test.ts`

- [ ] **Step 1: Écrire les tests qui échouent**

Ajouter dans `package.service.test.ts` :

```typescript
import { Prisma } from '@prisma/client';

describe('PackageService — consommation & soldes', () => {
  let service: PackageService;
  beforeEach(() => { service = new PackageService(); });

  it('consume ENTRIES : décrément conditionnel creditsRemaining >= 1', async () => {
    prismaMock.memberPackage.updateMany.mockResolvedValue({ count: 1 } as any);
    await PackageService.consume(prismaMock as any, { id: 'pkg-1', kind: 'ENTRIES' }, new Prisma.Decimal(25));
    expect(prismaMock.memberPackage.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: 'pkg-1', creditsRemaining: { gte: 1 } }),
      data: { creditsRemaining: { decrement: 1 } },
    }));
  });

  it('consume WALLET : décrément conditionnel amountRemaining >= montant', async () => {
    prismaMock.memberPackage.updateMany.mockResolvedValue({ count: 1 } as any);
    const amount = new Prisma.Decimal(25);
    await PackageService.consume(prismaMock as any, { id: 'pkg-2', kind: 'WALLET' }, amount);
    expect(prismaMock.memberPackage.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: 'pkg-2', amountRemaining: { gte: amount } }),
      data: { amountRemaining: { decrement: amount } },
    }));
  });

  it('consume lève INSUFFICIENT_BALANCE si le décrément ne touche aucune ligne (solde épuisé, expiré, ou course concurrente)', async () => {
    prismaMock.memberPackage.updateMany.mockResolvedValue({ count: 0 } as any);
    await expect(PackageService.consume(prismaMock as any, { id: 'pkg-1', kind: 'ENTRIES' }, new Prisma.Decimal(25)))
      .rejects.toThrow('INSUFFICIENT_BALANCE');
  });

  it('listMemberPackages renvoie les packages du membre avec le nom de l’offre', async () => {
    prismaMock.memberPackage.findMany.mockResolvedValue([] as any);
    await service.listMemberPackages('club-1', 'user-1');
    expect(prismaMock.memberPackage.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ clubId: 'club-1', userId: 'user-1' }),
    }));
  });

  it('listMyPackagesBySlug refuse un club inconnu ou suspendu', async () => {
    prismaMock.club.findUnique.mockResolvedValue(null as any);
    await expect(service.listMyPackagesBySlug('ghost', 'user-1')).rejects.toThrow('CLUB_NOT_FOUND');
  });
});
```

- [ ] **Step 2: Vérifier l'échec**

```bash
npm test -- package.service
```

Expected: FAIL — `PackageService.consume is not a function`.

- [ ] **Step 3: Implémenter consume + listes de soldes**

Ajouter dans la classe `PackageService` :

```typescript
  // --- Consommation & soldes ---

  /**
   * Débite un package DANS une transaction appelante : décrément conditionnel
   * (même rigueur que le zéro double-réservation). ENTRIES : -1 crédit ;
   * WALLET : -amount €. count === 0 (solde insuffisant, package expiré, ou
   * course concurrente) → INSUFFICIENT_BALANCE, la transaction appelante rollback.
   */
  static async consume(
    tx: Prisma.TransactionClient,
    pkg: { id: string; kind: PackageKind },
    amount: Prisma.Decimal,
  ) {
    const now = new Date();
    const notExpired = { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] };
    const res = pkg.kind === 'ENTRIES'
      ? await tx.memberPackage.updateMany({
          where: { id: pkg.id, creditsRemaining: { gte: 1 }, ...notExpired },
          data: { creditsRemaining: { decrement: 1 } },
        })
      : await tx.memberPackage.updateMany({
          where: { id: pkg.id, amountRemaining: { gte: amount }, ...notExpired },
          data: { amountRemaining: { decrement: amount } },
        });
    if (res.count === 0) throw new Error('INSUFFICIENT_BALANCE');
  }

  /** Tous les packages d'un membre (vue accueil : historique compris). */
  async listMemberPackages(clubId: string, userId: string) {
    return prisma.memberPackage.findMany({
      where: { clubId, userId },
      orderBy: { purchasedAt: 'desc' },
      include: { template: { select: { name: true } } },
    });
  }

  /** Packages UTILISABLES du joueur connecté sur un club (par slug). */
  async listMyPackagesBySlug(slug: string, userId: string) {
    const club = await prisma.club.findUnique({ where: { slug }, select: { id: true, status: true } });
    if (!club || club.status !== 'ACTIVE') throw new Error('CLUB_NOT_FOUND');
    const now = new Date();
    return prisma.memberPackage.findMany({
      where: {
        clubId: club.id, userId,
        AND: [
          { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
          { OR: [{ creditsRemaining: { gte: 1 } }, { amountRemaining: { gt: 0 } }] },
        ],
      },
      orderBy: { purchasedAt: 'asc' },
      include: { template: { select: { name: true } } },
    });
  }
```

- [ ] **Step 4: Vérifier que les tests passent**

```bash
npm test -- package.service
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/package.service.ts src/services/__tests__/package.service.test.ts
git commit -m "feat(caisse): consommation concurrent-sure (decrement conditionnel) + soldes"
```

---

### Task 5: addPayment étendu — VOUCHER, PACK_CREDIT, WALLET

**Files:**
- Modify: `backend/src/services/reservation.service.ts:527-559` (méthode `addPayment`)
- Test: `backend/src/services/__tests__/reservation.service.test.ts`

- [ ] **Step 1: Écrire les tests qui échouent**

Ajouter dans `reservation.service.test.ts` (nouveau `describe` au niveau racine du `describe('ReservationService')`) :

```typescript
  describe('addPayment étendu (caisse)', () => {
    const resa = { id: 'res-1', userId: 'user-1', resource: { clubId: 'club-1' } };

    beforeEach(() => {
      prismaMock.$transaction.mockImplementation(async (fn: any) => fn(prismaMock));
    });

    it('VOUCHER : exige une référence et pose voucherStatus PENDING_REIMBURSEMENT', async () => {
      prismaMock.reservation.findUnique.mockResolvedValue(resa as any);

      await expect(service.addPayment({ reservationId: 'res-1', clubId: 'club-1', amount: 25, method: 'VOUCHER' }))
        .rejects.toThrow('VALIDATION_ERROR');

      prismaMock.payment.create.mockResolvedValue({ id: 'pay-1' } as any);
      await service.addPayment({ reservationId: 'res-1', clubId: 'club-1', amount: 25, method: 'VOUCHER', voucherRef: 'ANCV-42', voucherIssuer: 'ANCV' });
      expect(prismaMock.payment.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ method: 'VOUCHER', voucherRef: 'ANCV-42', voucherStatus: 'PENDING_REIMBURSEMENT', clubId: 'club-1' }),
      }));
    });

    it('PACK_CREDIT : consomme 1 entrée et crée le paiement dans une transaction', async () => {
      prismaMock.reservation.findUnique.mockResolvedValue(resa as any);
      prismaMock.memberPackage.findUnique.mockResolvedValue({ id: 'pkg-1', clubId: 'club-1', userId: 'user-1', kind: 'ENTRIES' } as any);
      prismaMock.memberPackage.updateMany.mockResolvedValue({ count: 1 } as any);
      prismaMock.payment.create.mockResolvedValue({ id: 'pay-2' } as any);

      await service.addPayment({ reservationId: 'res-1', clubId: 'club-1', amount: 25, method: 'PACK_CREDIT', sourcePackageId: 'pkg-1' });

      expect(prismaMock.memberPackage.updateMany).toHaveBeenCalled();
      expect(prismaMock.payment.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ method: 'PACK_CREDIT', sourcePackageId: 'pkg-1' }),
      }));
    });

    it('WALLET : solde insuffisant → INSUFFICIENT_BALANCE, aucun paiement créé', async () => {
      prismaMock.reservation.findUnique.mockResolvedValue(resa as any);
      prismaMock.memberPackage.findUnique.mockResolvedValue({ id: 'pkg-2', clubId: 'club-1', userId: 'user-1', kind: 'WALLET' } as any);
      prismaMock.memberPackage.updateMany.mockResolvedValue({ count: 0 } as any);

      await expect(service.addPayment({ reservationId: 'res-1', clubId: 'club-1', amount: 25, method: 'WALLET', sourcePackageId: 'pkg-2' }))
        .rejects.toThrow('INSUFFICIENT_BALANCE');
      expect(prismaMock.payment.create).not.toHaveBeenCalled();
    });

    it('refuse un package d’un autre membre que celui de la résa', async () => {
      prismaMock.reservation.findUnique.mockResolvedValue(resa as any);
      prismaMock.memberPackage.findUnique.mockResolvedValue({ id: 'pkg-1', clubId: 'club-1', userId: 'autre-user', kind: 'ENTRIES' } as any);
      await expect(service.addPayment({ reservationId: 'res-1', clubId: 'club-1', amount: 25, method: 'PACK_CREDIT', sourcePackageId: 'pkg-1' }))
        .rejects.toThrow('PACKAGE_NOT_FOUND');
    });

    it('refuse PACK_CREDIT sur un porte-monnaie (kind mismatch)', async () => {
      prismaMock.reservation.findUnique.mockResolvedValue(resa as any);
      prismaMock.memberPackage.findUnique.mockResolvedValue({ id: 'pkg-2', clubId: 'club-1', userId: 'user-1', kind: 'WALLET' } as any);
      await expect(service.addPayment({ reservationId: 'res-1', clubId: 'club-1', amount: 25, method: 'PACK_CREDIT', sourcePackageId: 'pkg-2' }))
        .rejects.toThrow('VALIDATION_ERROR');
    });
  });
```

- [ ] **Step 2: Vérifier l'échec**

```bash
npm test -- reservation.service
```

Expected: FAIL sur les nouveaux tests (méthodes inconnues / champs absents). Les tests existants restent PASS.

- [ ] **Step 3: Réécrire addPayment**

Dans `backend/src/services/reservation.service.ts`, ajouter l'import en tête :

```typescript
import { PackageService } from './package.service';
```

et remplacer entièrement la méthode `addPayment` par :

```typescript
  /**
   * Encaissement manuel sur une réservation (vérifie le club).
   * VOUCHER : référence obligatoire, statut « à rembourser ».
   * PACK_CREDIT / WALLET : consomme le package du joueur (décrément conditionnel)
   * et crée le paiement dans la même transaction.
   */
  async addPayment(params: {
    reservationId: string;
    clubId: string;
    amount: number;
    method?: string;
    payerName?: string;
    note?: string;
    sourcePackageId?: string;
    voucherRef?: string;
    voucherIssuer?: string;
  }) {
    if (!(typeof params.amount === 'number') || isNaN(params.amount) || params.amount <= 0) {
      throw new Error('VALIDATION_ERROR');
    }
    const reservation = await prisma.reservation.findUnique({
      where: { id: params.reservationId },
      include: { resource: { select: { clubId: true } } },
    });
    if (!reservation)                                  throw new Error('RESERVATION_NOT_FOUND');
    if (reservation.resource.clubId !== params.clubId) throw new Error('CLUB_MISMATCH');

    const methods = ['CASH', 'CARD', 'TRANSFER', 'ONLINE', 'OTHER', 'VOUCHER', 'PACK_CREDIT', 'WALLET'];
    const method = (methods.includes(params.method ?? '') ? params.method : 'CASH') as
      'CASH' | 'CARD' | 'TRANSFER' | 'ONLINE' | 'OTHER' | 'VOUCHER' | 'PACK_CREDIT' | 'WALLET';
    if (method === 'VOUCHER' && !params.voucherRef?.trim()) throw new Error('VALIDATION_ERROR');

    const base = {
      reservationId: params.reservationId,
      clubId: params.clubId,
      amount: new Prisma.Decimal(params.amount),
      method,
      payerName: params.payerName?.trim() || null,
      note: params.note?.trim() || null,
      voucherRef:    method === 'VOUCHER' ? params.voucherRef!.trim() : null,
      voucherIssuer: method === 'VOUCHER' ? params.voucherIssuer?.trim() || null : null,
      voucherStatus: method === 'VOUCHER' ? ('PENDING_REIMBURSEMENT' as const) : null,
    };

    if (method !== 'PACK_CREDIT' && method !== 'WALLET') {
      return prisma.payment.create({ data: base });
    }

    // Paiement par solde prépayé : le package doit appartenir au joueur de la résa.
    if (!params.sourcePackageId) throw new Error('VALIDATION_ERROR');
    const pkg = await prisma.memberPackage.findUnique({ where: { id: params.sourcePackageId } });
    if (!pkg || pkg.clubId !== params.clubId)                       throw new Error('PACKAGE_NOT_FOUND');
    if (reservation.userId && pkg.userId !== reservation.userId)    throw new Error('PACKAGE_NOT_FOUND');
    if ((method === 'PACK_CREDIT') !== (pkg.kind === 'ENTRIES'))    throw new Error('VALIDATION_ERROR');

    return prisma.$transaction(async (tx) => {
      await PackageService.consume(tx, pkg, new Prisma.Decimal(params.amount));
      return tx.payment.create({ data: { ...base, sourcePackageId: pkg.id } });
    });
  }
```

- [ ] **Step 4: Vérifier que tous les tests passent**

```bash
npm test -- reservation.service
```

Expected: PASS (anciens + nouveaux).

- [ ] **Step 5: Commit**

```bash
git add src/services/reservation.service.ts src/services/__tests__/reservation.service.test.ts
git commit -m "feat(caisse): addPayment etendu - ticket CE, carnet, porte-monnaie"
```

---

### Task 6: Caisse du jour + suivi des tickets CE (backend)

**Files:**
- Modify: `backend/src/services/package.service.ts`
- Test: `backend/src/services/__tests__/package.service.test.ts`

- [ ] **Step 1: Écrire les tests qui échouent**

Ajouter dans `package.service.test.ts` :

```typescript
describe('PackageService — caisse du jour & vouchers', () => {
  let service: PackageService;
  beforeEach(() => { service = new PackageService(); });

  it('dailySummary borne la journée dans le fuseau du club et totalise par méthode', async () => {
    prismaMock.club.findUnique.mockResolvedValue({ timezone: 'Europe/Paris' } as any);
    prismaMock.payment.findMany.mockResolvedValue([
      { method: 'CASH', amount: 20 }, { method: 'CASH', amount: 5.5 }, { method: 'CARD', amount: 30 },
    ] as any);

    const out = await service.dailySummary('club-1', '2026-06-10');

    const where = prismaMock.payment.findMany.mock.calls[0][0]!.where as any;
    expect(where.clubId).toBe('club-1');
    // 2026-06-10 00:00 Europe/Paris = 2026-06-09T22:00:00Z (UTC+2 en juin)
    expect((where.createdAt.gte as Date).toISOString()).toBe('2026-06-09T22:00:00.000Z');
    expect((where.createdAt.lt as Date).toISOString()).toBe('2026-06-10T22:00:00.000Z');
    expect(out.totalsByMethod.CASH).toBe('25.50');
    expect(out.totalsByMethod.CARD).toBe('30.00');
    expect(out.collected).toBe('55.50');
  });

  it('dailySummary refuse une date invalide', async () => {
    prismaMock.club.findUnique.mockResolvedValue({ timezone: 'Europe/Paris' } as any);
    await expect(service.dailySummary('club-1', 'pas-une-date')).rejects.toThrow('VALIDATION_ERROR');
  });

  it('setVoucherStatus refuse un paiement non-voucher ou d’un autre club', async () => {
    prismaMock.payment.findUnique.mockResolvedValue({ id: 'pay-1', clubId: 'club-1', method: 'CASH' } as any);
    await expect(service.setVoucherStatus('pay-1', 'club-1', 'REIMBURSED')).rejects.toThrow('PAYMENT_NOT_FOUND');
  });

  it('setVoucherStatus marque remboursé', async () => {
    prismaMock.payment.findUnique.mockResolvedValue({ id: 'pay-1', clubId: 'club-1', method: 'VOUCHER' } as any);
    prismaMock.payment.update.mockResolvedValue({ id: 'pay-1', voucherStatus: 'REIMBURSED' } as any);
    await service.setVoucherStatus('pay-1', 'club-1', 'REIMBURSED');
    expect(prismaMock.payment.update).toHaveBeenCalledWith(expect.objectContaining({
      data: { voucherStatus: 'REIMBURSED' },
    }));
  });
});
```

- [ ] **Step 2: Vérifier l'échec**

```bash
npm test -- package.service
```

Expected: FAIL — `service.dailySummary is not a function`.

- [ ] **Step 3: Implémenter dailySummary, listVouchers, setVoucherStatus**

Ajouter dans la classe `PackageService` :

```typescript
  // --- Caisse du jour & tickets CE ---

  /** Détail joint pour libeller un paiement en caisse (résa ou vente de package). */
  private paymentInclude() {
    return {
      reservation: {
        select: {
          id: true, startTime: true,
          resource: { select: { name: true } },
          user: { select: { firstName: true, lastName: true } },
        },
      },
      memberPackage: {
        select: {
          id: true, kind: true,
          user: { select: { firstName: true, lastName: true } },
          template: { select: { name: true } },
        },
      },
    } as const;
  }

  /**
   * Récap de caisse d'une journée (fuseau du club) : liste des encaissements
   * + totaux par méthode. NB : PACK_CREDIT/WALLET = consommation de prépayé
   * (l'argent est entré au moment de la vente), affiché à part côté UI.
   */
  async dailySummary(clubId: string, date: string) {
    const club = await prisma.club.findUnique({ where: { id: clubId }, select: { timezone: true } });
    if (!club) throw new Error('CLUB_NOT_FOUND');
    const start = DateTime.fromISO(date, { zone: club.timezone }).startOf('day');
    if (!start.isValid) throw new Error('VALIDATION_ERROR');
    const end = start.plus({ days: 1 });

    const payments = await prisma.payment.findMany({
      where: { clubId, createdAt: { gte: start.toJSDate(), lt: end.toJSDate() } },
      orderBy: { createdAt: 'asc' },
      include: this.paymentInclude(),
    });

    const totals: Record<string, Prisma.Decimal> = {};
    let collected = new Prisma.Decimal(0);
    for (const p of payments) {
      totals[p.method] = (totals[p.method] ?? new Prisma.Decimal(0)).plus(p.amount);
      collected = collected.plus(p.amount);
    }
    const totalsByMethod: Record<string, string> = {};
    for (const [m, v] of Object.entries(totals)) totalsByMethod[m] = v.toFixed(2);

    return { date, totalsByMethod, collected: collected.toFixed(2), payments };
  }

  /** Tickets CE du club, filtrables par statut de remboursement. */
  async listVouchers(clubId: string, status?: VoucherStatus) {
    return prisma.payment.findMany({
      where: { clubId, method: 'VOUCHER', ...(status ? { voucherStatus: status } : {}) },
      orderBy: { createdAt: 'desc' },
      include: this.paymentInclude(),
    });
  }

  async setVoucherStatus(paymentId: string, clubId: string, status: VoucherStatus) {
    const p = await prisma.payment.findUnique({ where: { id: paymentId } });
    if (!p || p.clubId !== clubId || p.method !== 'VOUCHER') throw new Error('PAYMENT_NOT_FOUND');
    return prisma.payment.update({ where: { id: paymentId }, data: { voucherStatus: status } });
  }
```

- [ ] **Step 4: Vérifier que les tests passent**

```bash
npm test -- package.service
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/package.service.ts src/services/__tests__/package.service.test.ts
git commit -m "feat(caisse): recap de caisse journalier + suivi remboursement tickets CE"
```

---

### Task 7: Routes admin + user.id dans le planning

**Files:**
- Modify: `backend/src/routes/admin.ts`
- Modify: `backend/src/services/reservation.service.ts:496` (select user de `listClubReservations`)

- [ ] **Step 1: Exposer user.id dans listClubReservations**

Dans `reservation.service.ts`, méthode `listClubReservations`, remplacer :

```typescript
        user:     { select: { firstName: true, lastName: true, email: true } },
```

par :

```typescript
        user:     { select: { id: true, firstName: true, lastName: true, email: true } },
```

(nécessaire au planning pour charger les soldes du joueur sélectionné).

- [ ] **Step 2: Ajouter les routes dans admin.ts**

Dans `backend/src/routes/admin.ts` :

1. Import et instance (en tête, avec les autres services) :

```typescript
import { PackageService } from '../services/package.service';
```
```typescript
const packageService = new PackageService();
```

2. Compléter `ERROR_STATUS` :

```typescript
  TEMPLATE_NOT_FOUND:     404,
  PACKAGE_NOT_FOUND:      404,
  PAYMENT_NOT_FOUND:      404,
  INSUFFICIENT_BALANCE:   409,
  CLUB_NOT_FOUND:         404,
```

3. Étendre l'encaissement existant (route `POST /reservations/:id/payments`, ligne 271) — remplacer le corps du handler par :

```typescript
    const { amount, method, payerName, note, sourcePackageId, voucherRef, voucherIssuer } = req.body;
    const payment = await reservationService.addPayment({
      reservationId: asString(req.params.id),
      clubId: req.membership!.clubId,
      amount: Number(amount),
      method, payerName, note,
      sourcePackageId: typeof sourcePackageId === 'string' && sourcePackageId ? sourcePackageId : undefined,
      voucherRef:      typeof voucherRef === 'string' ? voucherRef : undefined,
      voucherIssuer:   typeof voucherIssuer === 'string' ? voucherIssuer : undefined,
    });
    res.status(201).json(payment);
```

4. Ajouter avant `export default router;` :

```typescript
// --- Offres prépayées (carnets / porte-monnaie) ---
router.get('/packages/templates', async (req: ClubScopedRequest, res: Response, next: NextFunction) => {
  try { res.json(await packageService.listTemplates(req.membership!.clubId)); } catch (e) { handleError(e, res, next); }
});
router.post('/packages/templates', async (req: ClubScopedRequest, res: Response, next: NextFunction) => {
  try { res.status(201).json(await packageService.createTemplate(req.membership!.clubId, req.body)); } catch (e) { handleError(e, res, next); }
});
router.patch('/packages/templates/:id', async (req: ClubScopedRequest, res: Response, next: NextFunction) => {
  try { res.json(await packageService.updateTemplate(asString(req.params.id), req.membership!.clubId, req.body)); } catch (e) { handleError(e, res, next); }
});

// Soldes d'un membre + vente d'une offre en caisse.
router.get('/members/:userId/packages', async (req: ClubScopedRequest, res: Response, next: NextFunction) => {
  try { res.json(await packageService.listMemberPackages(req.membership!.clubId, asString(req.params.userId))); } catch (e) { handleError(e, res, next); }
});
router.post('/members/:userId/packages', async (req: ClubScopedRequest, res: Response, next: NextFunction) => {
  try { res.status(201).json(await packageService.sellPackage(req.membership!.clubId, asString(req.params.userId), req.body)); } catch (e) { handleError(e, res, next); }
});

// --- Caisse du jour & tickets CE ---
router.get('/caisse', async (req: ClubScopedRequest, res: Response, next: NextFunction) => {
  try {
    const date = asString(req.query.date);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return void res.status(400).json({ error: 'date doit être YYYY-MM-DD' });
    res.json(await packageService.dailySummary(req.membership!.clubId, date));
  } catch (e) { handleError(e, res, next); }
});
router.get('/caisse/vouchers', async (req: ClubScopedRequest, res: Response, next: NextFunction) => {
  try {
    const status = asString(req.query.status);
    if (status && status !== 'PENDING_REIMBURSEMENT' && status !== 'REIMBURSED') {
      return void res.status(400).json({ error: 'status invalide' });
    }
    res.json(await packageService.listVouchers(req.membership!.clubId, (status || undefined) as 'PENDING_REIMBURSEMENT' | 'REIMBURSED' | undefined));
  } catch (e) { handleError(e, res, next); }
});
router.patch('/payments/:id/voucher', async (req: ClubScopedRequest, res: Response, next: NextFunction) => {
  try {
    const status = asString(req.body.status);
    if (status !== 'PENDING_REIMBURSEMENT' && status !== 'REIMBURSED') {
      return void res.status(400).json({ error: 'status invalide' });
    }
    res.json(await packageService.setVoucherStatus(asString(req.params.id), req.membership!.clubId, status));
  } catch (e) { handleError(e, res, next); }
});
```

- [ ] **Step 3: Compiler et lancer la suite backend**

```bash
npx tsc --noEmit
npm test
```

Expected: compilation OK, tous les tests PASS.

- [ ] **Step 4: Commit**

```bash
git add src/routes/admin.ts src/services/reservation.service.ts
git commit -m "feat(caisse): routes admin offres/vente/caisse/vouchers + user.id planning"
```

---

### Task 8: confirmReservation avec paymentSource + routes joueur

**Files:**
- Modify: `backend/src/services/reservation.service.ts:121-176` (méthode `confirmReservation`)
- Modify: `backend/src/routes/reservations.ts`
- Modify: `backend/src/routes/clubs.ts`
- Test: `backend/src/services/__tests__/reservation.service.test.ts`

- [ ] **Step 1: Écrire les tests qui échouent**

Dans le `describe('confirmReservation')` existant de `reservation.service.test.ts`, **mettre à jour les mocks existants** : chaque `prismaMock.reservation.findUnique.mockResolvedValue({...})` du bloc confirm doit recevoir en plus `resource: { clubId: 'club-demo' }` (le service lira désormais le club de la résa). Puis ajouter :

```typescript
    it('consomme le package et crée le paiement quand paymentSource est fourni', async () => {
      prismaMock.reservation.findUnique.mockResolvedValue({
        id: 'res-1', userId: 'user-1', status: 'PENDING', createdAt: new Date(),
        resourceId: 'court-1', startTime: new Date(), endTime: new Date(),
        totalPrice: 25, resource: { clubId: 'club-demo' },
      } as any);
      prismaMock.$transaction.mockImplementation(async (fn: any) => fn(prismaMock));
      prismaMock.$queryRaw
        .mockResolvedValueOnce([{ id: 'res-1', status: 'PENDING', resource_id: 'court-1', start_time: new Date(), end_time: new Date() }])
        .mockResolvedValueOnce([{ count: 0n }]);
      prismaMock.memberPackage.findUnique.mockResolvedValue({ id: 'pkg-1', clubId: 'club-demo', userId: 'user-1', kind: 'ENTRIES' } as any);
      prismaMock.memberPackage.updateMany.mockResolvedValue({ count: 1 } as any);
      prismaMock.payment.create.mockResolvedValue({ id: 'pay-1' } as any);
      prismaMock.reservation.update.mockResolvedValue({
        id: 'res-1', resourceId: 'court-1', status: 'CONFIRMED',
        startTime: new Date(), endTime: new Date(),
      } as any);

      await service.confirmReservation('res-1', 'user-1', { packageId: 'pkg-1' });

      expect(prismaMock.memberPackage.updateMany).toHaveBeenCalled();
      expect(prismaMock.payment.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ method: 'PACK_CREDIT', sourcePackageId: 'pkg-1', reservationId: 'res-1' }),
      }));
    });

    it('solde insuffisant → INSUFFICIENT_BALANCE et la résa reste PENDING', async () => {
      prismaMock.reservation.findUnique.mockResolvedValue({
        id: 'res-1', userId: 'user-1', status: 'PENDING', createdAt: new Date(),
        resourceId: 'court-1', startTime: new Date(), endTime: new Date(),
        totalPrice: 25, resource: { clubId: 'club-demo' },
      } as any);
      prismaMock.$transaction.mockImplementation(async (fn: any) => fn(prismaMock));
      prismaMock.$queryRaw
        .mockResolvedValueOnce([{ id: 'res-1', status: 'PENDING', resource_id: 'court-1', start_time: new Date(), end_time: new Date() }])
        .mockResolvedValueOnce([{ count: 0n }]);
      prismaMock.memberPackage.findUnique.mockResolvedValue({ id: 'pkg-1', clubId: 'club-demo', userId: 'user-1', kind: 'ENTRIES' } as any);
      prismaMock.memberPackage.updateMany.mockResolvedValue({ count: 0 } as any);

      await expect(service.confirmReservation('res-1', 'user-1', { packageId: 'pkg-1' }))
        .rejects.toThrow('INSUFFICIENT_BALANCE');
      expect(prismaMock.reservation.update).not.toHaveBeenCalled();
    });

    it('refuse le package d’un autre joueur ou d’un autre club', async () => {
      prismaMock.reservation.findUnique.mockResolvedValue({
        id: 'res-1', userId: 'user-1', status: 'PENDING', createdAt: new Date(),
        resourceId: 'court-1', startTime: new Date(), endTime: new Date(),
        totalPrice: 25, resource: { clubId: 'club-demo' },
      } as any);
      prismaMock.$transaction.mockImplementation(async (fn: any) => fn(prismaMock));
      prismaMock.$queryRaw
        .mockResolvedValueOnce([{ id: 'res-1', status: 'PENDING', resource_id: 'court-1', start_time: new Date(), end_time: new Date() }])
        .mockResolvedValueOnce([{ count: 0n }]);
      prismaMock.memberPackage.findUnique.mockResolvedValue({ id: 'pkg-1', clubId: 'autre-club', userId: 'user-1', kind: 'ENTRIES' } as any);

      await expect(service.confirmReservation('res-1', 'user-1', { packageId: 'pkg-1' }))
        .rejects.toThrow('PACKAGE_NOT_FOUND');
    });
```

- [ ] **Step 2: Vérifier l'échec**

```bash
npm test -- reservation.service
```

Expected: FAIL sur les 3 nouveaux tests.

- [ ] **Step 3: Étendre confirmReservation**

Dans `reservation.service.ts`, remplacer la signature et le début de `confirmReservation` :

```typescript
  async confirmReservation(
    reservationId: string,
    userId: string,
    paymentSource?: { packageId: string },
  ) {
    const reservation = await prisma.reservation.findUnique({
      where: { id: reservationId },
      include: { resource: { select: { clubId: true } } },
    });
```

(les 4 gardes existantes restent inchangées), puis remplacer le corps de la transaction — le `return tx.reservation.update(...)` final devient :

```typescript
      // Paiement par carnet / porte-monnaie : consommation dans la MÊME
      // transaction Serializable — solde insuffisant → tout rollback, la
      // résa reste PENDING et payable autrement.
      if (paymentSource) {
        const pkg = await tx.memberPackage.findUnique({ where: { id: paymentSource.packageId } });
        if (!pkg || pkg.userId !== userId || pkg.clubId !== reservation.resource.clubId) {
          throw new Error('PACKAGE_NOT_FOUND');
        }
        const amount = new Prisma.Decimal(reservation.totalPrice);
        await PackageService.consume(tx, pkg, amount);
        await tx.payment.create({
          data: {
            reservationId,
            clubId: reservation.resource.clubId,
            amount,
            method: pkg.kind === 'ENTRIES' ? 'PACK_CREDIT' : 'WALLET',
            sourcePackageId: pkg.id,
          },
        });
      }

      return tx.reservation.update({
        where: { id: reservationId },
        data:  { status: 'CONFIRMED' },
      });
```

- [ ] **Step 4: Vérifier que les tests passent**

```bash
npm test -- reservation.service
```

Expected: PASS (tous, y compris les anciens tests confirm adaptés au Step 1).

- [ ] **Step 5: Brancher la route confirm et la route joueur des soldes**

Dans `backend/src/routes/reservations.ts` :

1. Compléter `ERROR_STATUS` :

```typescript
  INSUFFICIENT_BALANCE:     409,
  PACKAGE_NOT_FOUND:        404,
```

2. Remplacer le handler de `POST /:id/confirm` :

```typescript
router.post('/:id/confirm', authMiddleware, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const packageId = req.body?.paymentSource?.packageId;
    const confirmed = await reservationService.confirmReservation(
      asString(req.params.id), req.user!.id,
      typeof packageId === 'string' && packageId ? { packageId } : undefined,
    );
    res.json(confirmed);
  } catch (err) { handleError(err, res, next); }
});
```

Dans `backend/src/routes/clubs.ts` :

1. Import + instance :

```typescript
import { PackageService } from '../services/package.service';
```
```typescript
const packageService = new PackageService();
```

2. Ajouter `CLUB_NOT_FOUND: 404` dans `ERROR_STATUS` s'il n'y est pas.

3. Ajouter après la route `PATCH /:slug/me/membership` (et avant `GET /:slug`) :

```typescript
// Soldes prépayés (carnets / porte-monnaie) du joueur connecté sur ce club.
router.get('/:slug/me/packages', authMiddleware, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try { res.json(await packageService.listMyPackagesBySlug(asString(req.params.slug), req.user!.id)); }
  catch (err) { handleError(err, res, next); }
});
```

- [ ] **Step 6: Compiler + suite complète**

```bash
npx tsc --noEmit
npm test
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/services/reservation.service.ts src/routes/reservations.ts src/routes/clubs.ts src/services/__tests__/reservation.service.test.ts
git commit -m "feat(caisse): paiement par carnet/porte-monnaie a la confirmation en ligne"
```

---

### Task 9: Frontend — api.ts (types + méthodes)

**Files:**
- Modify: `frontend/lib/api.ts`

- [ ] **Step 1: Étendre les types**

Dans `frontend/lib/api.ts` :

1. Remplacer le type `PaymentMethod` (ligne 518) :

```typescript
export type PaymentMethod = 'CASH' | 'CARD' | 'TRANSFER' | 'ONLINE' | 'OTHER' | 'VOUCHER' | 'PACK_CREDIT' | 'WALLET';
export type PackageKind = 'ENTRIES' | 'WALLET';
export type VoucherStatus = 'PENDING_REIMBURSEMENT' | 'REIMBURSED';
```

2. Étendre `Payment` (ajouter avant `createdAt`) :

```typescript
  voucherRef: string | null;
  voucherIssuer: string | null;
  voucherStatus: VoucherStatus | null;
```

3. Étendre `AddPaymentBody` :

```typescript
export interface AddPaymentBody {
  amount: number;
  method?: PaymentMethod;
  payerName?: string;
  note?: string;
  sourcePackageId?: string;
  voucherRef?: string;
  voucherIssuer?: string;
}
```

4. Dans `ClubReservation`, le user gagne son id :

```typescript
  user: { id: string; firstName: string; lastName: string; email: string } | null;
```

5. Ajouter les nouveaux types (après les types back-office) :

```typescript
export interface PackageTemplate {
  id: string;
  kind: PackageKind;
  name: string;
  price: string;
  entriesCount: number | null;
  walletAmount: string | null;
  validityDays: number | null;
  isActive: boolean;
  createdAt: string;
}

export interface MemberPackage {
  id: string;
  kind: PackageKind;
  creditsTotal: number | null;
  creditsRemaining: number | null;
  amountTotal: string | null;
  amountRemaining: string | null;
  purchasedAt: string;
  expiresAt: string | null;
  template: { name: string };
}

export interface CaissePayment extends Payment {
  reservation: {
    id: string; startTime: string;
    resource: { name: string };
    user: { firstName: string; lastName: string } | null;
  } | null;
  memberPackage: {
    id: string; kind: PackageKind;
    user: { firstName: string; lastName: string };
    template: { name: string };
  } | null;
}

export interface CaisseSummary {
  date: string;
  totalsByMethod: Partial<Record<PaymentMethod, string>>;
  collected: string;
  payments: CaissePayment[];
}

export interface SellPackageBody {
  templateId: string;
  method?: PaymentMethod;
  payerName?: string;
  voucherRef?: string;
  voucherIssuer?: string;
}

export type CreatePackageTemplateBody = {
  kind: PackageKind; name: string; price: number;
  entriesCount?: number; walletAmount?: number; validityDays?: number | null;
};
export type UpdatePackageTemplateBody = Partial<{ name: string; price: number; validityDays: number | null; isActive: boolean }>;
```

- [ ] **Step 2: Ajouter les méthodes API**

1. Remplacer `confirmReservation` :

```typescript
  confirmReservation: (reservationId: string, token: string, paymentSource?: { packageId: string }) =>
    request<Reservation>(`/api/reservations/${reservationId}/confirm`, {
      method: 'POST',
      body: JSON.stringify(paymentSource ? { paymentSource } : {}),
    }, token),
```

2. Ajouter dans le bloc back-office (après `adminAddPayment`) :

```typescript
  // --- Offres prépayées & caisse ---
  adminGetPackageTemplates: (clubId: string, token: string) =>
    request<PackageTemplate[]>(`/api/clubs/${clubId}/admin/packages/templates`, {}, token),

  adminCreatePackageTemplate: (clubId: string, body: CreatePackageTemplateBody, token: string) =>
    request<PackageTemplate>(`/api/clubs/${clubId}/admin/packages/templates`, { method: 'POST', body: JSON.stringify(body) }, token),

  adminUpdatePackageTemplate: (clubId: string, id: string, body: UpdatePackageTemplateBody, token: string) =>
    request<PackageTemplate>(`/api/clubs/${clubId}/admin/packages/templates/${id}`, { method: 'PATCH', body: JSON.stringify(body) }, token),

  adminGetMemberPackages: (clubId: string, userId: string, token: string) =>
    request<MemberPackage[]>(`/api/clubs/${clubId}/admin/members/${userId}/packages`, {}, token),

  adminSellPackage: (clubId: string, userId: string, body: SellPackageBody, token: string) =>
    request<{ package: MemberPackage; payment: Payment }>(`/api/clubs/${clubId}/admin/members/${userId}/packages`, { method: 'POST', body: JSON.stringify(body) }, token),

  adminGetCaisse: (clubId: string, date: string, token: string) =>
    request<CaisseSummary>(`/api/clubs/${clubId}/admin/caisse?date=${date}`, {}, token),

  adminGetVouchers: (clubId: string, status: VoucherStatus | '', token: string) =>
    request<CaissePayment[]>(`/api/clubs/${clubId}/admin/caisse/vouchers${status ? `?status=${status}` : ''}`, {}, token),

  adminSetVoucherStatus: (clubId: string, paymentId: string, status: VoucherStatus, token: string) =>
    request<Payment>(`/api/clubs/${clubId}/admin/payments/${paymentId}/voucher`, { method: 'PATCH', body: JSON.stringify({ status }) }, token),
```

3. Ajouter dans le bloc joueur (après `updateMyClubMembership`) :

```typescript
  // Soldes prépayés du joueur sur ce club.
  getMyClubPackages: (slug: string, token: string) =>
    request<MemberPackage[]>(`/api/clubs/${slug}/me/packages`, {}, token),
```

- [ ] **Step 3: Vérifier la compilation et les tests frontend**

```bash
npx tsc --noEmit
npm test
```

Expected: compilation OK. Les tests existants qui mockent `confirmReservation` restent PASS (paramètre optionnel ajouté en dernière position).

- [ ] **Step 4: Commit**

```bash
git add lib/api.ts
git commit -m "feat(caisse): client API - packages, caisse, vouchers, confirm avec paymentSource"
```

---

### Task 10: Frontend — helpers purs lib/packages.ts

**Files:**
- Create: `frontend/lib/packages.ts`
- Test: `frontend/__tests__/packages.test.ts`

- [ ] **Step 1: Écrire les tests qui échouent**

Créer `frontend/__tests__/packages.test.ts` :

```typescript
import { packageLabel, isUsable, canCover } from '@/lib/packages';
import type { MemberPackage } from '@/lib/api';

const entries = (remaining: number, expiresAt: string | null = null): MemberPackage => ({
  id: 'p1', kind: 'ENTRIES', creditsTotal: 10, creditsRemaining: remaining,
  amountTotal: null, amountRemaining: null, purchasedAt: '2026-06-01T00:00:00Z',
  expiresAt, template: { name: '10 entrées' },
});

const wallet = (remaining: string): MemberPackage => ({
  id: 'p2', kind: 'WALLET', creditsTotal: null, creditsRemaining: null,
  amountTotal: '200.00', amountRemaining: remaining, purchasedAt: '2026-06-01T00:00:00Z',
  expiresAt: null, template: { name: 'Avoir 200 €' },
});

describe('packageLabel', () => {
  it('libelle un carnet avec ses entrées restantes', () => {
    expect(packageLabel(entries(7))).toBe('Carnet — 7 entrées');
    expect(packageLabel(entries(1))).toBe('Carnet — 1 entrée');
  });
  it('libelle un porte-monnaie avec son solde €', () => {
    expect(packageLabel(wallet('53.50'))).toBe('Porte-monnaie — 53,50 €');
  });
});

describe('isUsable', () => {
  const now = new Date('2026-06-10T12:00:00Z');
  it('carnet avec crédit non expiré → utilisable', () => {
    expect(isUsable(entries(1), now)).toBe(true);
  });
  it('carnet épuisé ou expiré → non utilisable', () => {
    expect(isUsable(entries(0), now)).toBe(false);
    expect(isUsable(entries(5, '2026-06-09T00:00:00Z'), now)).toBe(false);
  });
  it('porte-monnaie à 0 → non utilisable', () => {
    expect(isUsable(wallet('0.00'), now)).toBe(false);
  });
});

describe('canCover', () => {
  const now = new Date('2026-06-10T12:00:00Z');
  it('un carnet utilisable couvre toujours (1 entrée = 1 résa)', () => {
    expect(canCover(entries(1), 999, now)).toBe(true);
  });
  it('un porte-monnaie couvre si son solde >= montant', () => {
    expect(canCover(wallet('25.00'), 25, now)).toBe(true);
    expect(canCover(wallet('24.99'), 25, now)).toBe(false);
  });
});
```

- [ ] **Step 2: Vérifier l'échec**

```bash
npm test -- packages.test
```

Expected: FAIL — module `@/lib/packages` introuvable.

- [ ] **Step 3: Implémenter les helpers**

Créer `frontend/lib/packages.ts` :

```typescript
import type { MemberPackage } from '@/lib/api';

/** Libellé court d'un solde : « Carnet — 7 entrées » / « Porte-monnaie — 53,50 € ». */
export function packageLabel(p: MemberPackage): string {
  if (p.kind === 'ENTRIES') {
    const n = p.creditsRemaining ?? 0;
    return `Carnet — ${n} entrée${n > 1 ? 's' : ''}`;
  }
  return `Porte-monnaie — ${Number(p.amountRemaining ?? 0).toFixed(2).replace('.', ',')} €`;
}

/** Un package est utilisable s'il a du solde et n'est pas expiré. */
export function isUsable(p: MemberPackage, now: Date = new Date()): boolean {
  if (p.expiresAt && new Date(p.expiresAt) <= now) return false;
  return p.kind === 'ENTRIES' ? (p.creditsRemaining ?? 0) >= 1 : Number(p.amountRemaining ?? 0) > 0;
}

/** true si le package peut couvrir `amount` € (toujours vrai pour un carnet utilisable). */
export function canCover(p: MemberPackage, amount: number, now: Date = new Date()): boolean {
  if (!isUsable(p, now)) return false;
  return p.kind === 'ENTRIES' ? true : Number(p.amountRemaining) >= amount;
}
```

- [ ] **Step 4: Vérifier que les tests passent**

```bash
npm test -- packages.test
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/packages.ts __tests__/packages.test.ts
git commit -m "feat(caisse): helpers purs soldes packages (label, utilisable, couverture)"
```

---

### Task 11: Page /admin/packages (gestion des offres) + nav

**Files:**
- Create: `frontend/app/admin/packages/page.tsx`
- Modify: `frontend/app/admin/layout.tsx:47-58` (tableau `links`)

- [ ] **Step 1: Ajouter les liens de navigation**

Dans `frontend/app/admin/layout.tsx`, dans le tableau `links`, insérer après la ligne `/admin/reservations` :

```typescript
    { href: '/admin/caisse',       label: 'Caisse',          icon: 'ticket' as const },
    { href: '/admin/packages',     label: 'Offres prépayées', icon: 'bolt' as const },
```

- [ ] **Step 2: Créer la page de gestion des offres**

Créer `frontend/app/admin/packages/page.tsx` (suivre le style inline + `useTheme` des autres pages admin, ex. `announcements`) :

```typescript
'use client';
import { useState, useEffect, useCallback } from 'react';
import { api, PackageTemplate, PackageKind } from '@/lib/api';
import { useAuth } from '@/lib/useAuth';
import { useClub } from '@/lib/ClubProvider';
import { useTheme } from '@/lib/ThemeProvider';
import { Btn } from '@/components/ui/atoms';

const euro = (s: string | number) => `${Number(s).toFixed(2).replace('.', ',')} €`;

export default function AdminPackagesPage() {
  const { th } = useTheme();
  const { token, ready } = useAuth();
  const { club } = useClub();
  const clubId = club?.id;

  const [templates, setTemplates] = useState<PackageTemplate[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [busy, setBusy]           = useState(false);

  const [kind, setKind]           = useState<PackageKind>('ENTRIES');
  const [name, setName]           = useState('');
  const [price, setPrice]         = useState('');
  const [entries, setEntries]     = useState('10');
  const [walletAmount, setWallet] = useState('');
  const [validity, setValidity]   = useState('');

  const load = useCallback(async () => {
    if (!token || !clubId) return;
    setLoading(true);
    try { setError(null); setTemplates(await api.adminGetPackageTemplates(clubId, token)); }
    catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }, [token, clubId]);

  useEffect(() => { if (ready && token && clubId) load(); }, [ready, token, clubId, load]);

  const create = async () => {
    if (!token || !clubId) return;
    if (!name.trim() || !price) { setError('Nom et prix requis.'); return; }
    setBusy(true);
    try {
      setError(null);
      await api.adminCreatePackageTemplate(clubId, {
        kind, name: name.trim(), price: Number(price),
        entriesCount: kind === 'ENTRIES' ? Number(entries) : undefined,
        walletAmount: kind === 'WALLET' ? Number(walletAmount) : undefined,
        validityDays: validity ? Number(validity) : null,
      }, token);
      setName(''); setPrice(''); setWallet('');
      await load();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };

  const toggleActive = async (t: PackageTemplate) => {
    if (!token || !clubId) return;
    setBusy(true);
    try { setError(null); await api.adminUpdatePackageTemplate(clubId, t.id, { isActive: !t.isActive }, token); await load(); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };

  const input = { border: `1px solid ${th.line}`, background: th.bg, color: th.text, borderRadius: 8, padding: '8px 10px', fontFamily: th.fontUI, fontSize: 14 } as const;
  const label = { fontSize: 12, color: th.textMute, display: 'flex', flexDirection: 'column' as const, gap: 4 };

  return (
    <div>
      <h1 style={{ fontFamily: th.fontDisplay, fontWeight: 600, fontSize: 34, letterSpacing: -0.5, margin: '0 0 18px', color: th.text }}>Offres prépayées</h1>
      {error && <div style={{ marginBottom: 16, background: '#ff7a4d', color: '#fff', borderRadius: 12, padding: '11px 14px', fontFamily: th.fontUI, fontSize: 13.5, fontWeight: 600 }}>{error}</div>}

      {/* création */}
      <div style={{ background: th.surface, borderRadius: 16, padding: 18, marginBottom: 22, boxShadow: `inset 0 0 0 1px ${th.line}` }}>
        <div style={{ fontFamily: th.fontUI, fontSize: 13, fontWeight: 700, color: th.text, marginBottom: 12 }}>Nouvelle offre</div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          {(['ENTRIES', 'WALLET'] as PackageKind[]).map((k) => (
            <button key={k} type="button" onClick={() => setKind(k)}
              style={{ border: `1.5px solid ${kind === k ? th.accent : th.line}`, background: kind === k ? th.surface2 : 'transparent', borderRadius: 10, padding: '7px 12px', cursor: 'pointer', fontFamily: th.fontUI, fontSize: 13, fontWeight: 600, color: th.text }}>
              {k === 'ENTRIES' ? 'Carnet d’entrées' : 'Porte-monnaie €'}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <label style={{ ...label, flex: 1, minWidth: 180 }}>Nom
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder={kind === 'ENTRIES' ? 'Ex. 10 entrées' : 'Ex. Avoir 200 €'} style={input} />
          </label>
          <label style={label}>Prix de vente €
            <input type="number" min={0} step="0.5" value={price} onChange={(e) => setPrice(e.target.value)} style={{ ...input, width: 90 }} />
          </label>
          {kind === 'ENTRIES' ? (
            <label style={label}>Entrées
              <input type="number" min={1} step="1" value={entries} onChange={(e) => setEntries(e.target.value)} style={{ ...input, width: 70 }} />
            </label>
          ) : (
            <label style={label}>Montant crédité €
              <input type="number" min={0} step="0.5" value={walletAmount} onChange={(e) => setWallet(e.target.value)} style={{ ...input, width: 110 }} />
            </label>
          )}
          <label style={label}>Validité (jours, vide = sans)
            <input type="number" min={1} step="1" value={validity} onChange={(e) => setValidity(e.target.value)} style={{ ...input, width: 110 }} />
          </label>
          <Btn type="button" icon="plus" onClick={create} disabled={busy}>{busy ? '…' : 'Créer'}</Btn>
        </div>
      </div>

      {/* liste */}
      {loading ? (
        <div style={{ fontFamily: th.fontUI, color: th.textFaint }}>Chargement…</div>
      ) : templates.length === 0 ? (
        <div style={{ fontFamily: th.fontUI, color: th.textMute }}>Aucune offre pour l’instant.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {templates.map((t) => (
            <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 14, background: th.surface, borderRadius: 14, padding: '13px 16px', boxShadow: `inset 0 0 0 1px ${th.line}`, opacity: t.isActive ? 1 : 0.55 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: th.fontUI, fontSize: 14.5, fontWeight: 700, color: th.text }}>{t.name}</div>
                <div style={{ fontFamily: th.fontUI, fontSize: 12.5, color: th.textMute }}>
                  {t.kind === 'ENTRIES' ? `${t.entriesCount} entrées` : `${euro(t.walletAmount ?? 0)} crédités`}
                  {' · '}{euro(t.price)}
                  {t.validityDays ? ` · valable ${t.validityDays} j` : ' · sans expiration'}
                </div>
              </div>
              <button type="button" onClick={() => toggleActive(t)} disabled={busy}
                style={{ border: `1px solid ${th.line}`, background: 'transparent', color: t.isActive ? '#ff7a4d' : th.text, borderRadius: 9, padding: '7px 12px', cursor: 'pointer', fontFamily: th.fontUI, fontSize: 12.5, fontWeight: 600 }}>
                {t.isActive ? 'Désactiver' : 'Réactiver'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Vérifier compilation + tests**

```bash
npx tsc --noEmit
npm test
```

Expected: OK / PASS.

- [ ] **Step 4: Commit**

```bash
git add app/admin/packages/page.tsx app/admin/layout.tsx
git commit -m "feat(caisse): page admin Offres prepayees + liens nav Caisse/Offres"
```

---

### Task 12: Page /admin/caisse (récap du jour, vente, tickets CE)

**Files:**
- Create: `frontend/app/admin/caisse/page.tsx`

- [ ] **Step 1: Créer la page caisse**

Créer `frontend/app/admin/caisse/page.tsx` :

```typescript
'use client';
import { useState, useEffect, useCallback } from 'react';
import { api, CaisseSummary, CaissePayment, Member, MemberPackage, PackageTemplate, PaymentMethod } from '@/lib/api';
import { packageLabel } from '@/lib/packages';
import { useAuth } from '@/lib/useAuth';
import { useClub } from '@/lib/ClubProvider';
import { useTheme } from '@/lib/ThemeProvider';
import { Btn } from '@/components/ui/atoms';

const METHOD_LABEL: Record<PaymentMethod, string> = {
  CASH: 'Espèces', CARD: 'Carte', TRANSFER: 'Virement', ONLINE: 'En ligne', OTHER: 'Autre',
  VOUCHER: 'Ticket CE', PACK_CREDIT: 'Carnet', WALLET: 'Porte-monnaie',
};
// Méthodes qui font entrer de l'argent (les prépayés sont des consommations).
const MONEY_METHODS: PaymentMethod[] = ['CASH', 'CARD', 'TRANSFER', 'ONLINE', 'OTHER', 'VOUCHER'];
const SALE_METHODS: PaymentMethod[] = ['CASH', 'CARD', 'TRANSFER', 'VOUCHER', 'OTHER'];

function todayISO(): string { return new Date().toISOString().slice(0, 10); }
const euro = (s: string | number) => `${Number(s).toFixed(2).replace('.', ',')} €`;

function paymentLabel(p: CaissePayment): string {
  if (p.memberPackage) return `${p.memberPackage.user.firstName} ${p.memberPackage.user.lastName} · ${p.memberPackage.template.name}`;
  if (p.reservation) {
    const who = p.reservation.user ? `${p.reservation.user.firstName} ${p.reservation.user.lastName}` : 'Réservation';
    return `${who} · ${p.reservation.resource.name}`;
  }
  return p.payerName ?? 'Encaissement';
}

export default function AdminCaissePage() {
  const { th } = useTheme();
  const { token, ready } = useAuth();
  const { club } = useClub();
  const clubId = club?.id;

  const [date, setDate]       = useState(todayISO());
  const [caisse, setCaisse]   = useState<CaisseSummary | null>(null);
  const [outstanding, setOut] = useState('0.00');
  const [vouchers, setVouchers] = useState<CaissePayment[]>([]);
  const [error, setError]     = useState<string | null>(null);
  const [busy, setBusy]       = useState(false);

  // vente de carnet
  const [members, setMembers]     = useState<Member[]>([]);
  const [templates, setTemplates] = useState<PackageTemplate[]>([]);
  const [query, setQuery]         = useState('');
  const [buyer, setBuyer]         = useState<Member | null>(null);
  const [buyerPackages, setBuyerPackages] = useState<MemberPackage[]>([]);
  const [sellTplId, setSellTplId] = useState('');
  const [sellMethod, setSellMethod] = useState<PaymentMethod>('CASH');
  const [sellRef, setSellRef]     = useState('');
  const [sellIssuer, setSellIssuer] = useState('');

  const load = useCallback(async () => {
    if (!token || !clubId) return;
    try {
      setError(null);
      const [c, resv, v, mem, tpl] = await Promise.all([
        api.adminGetCaisse(clubId, date, token),
        api.adminGetReservations(clubId, { date }, token),
        api.adminGetVouchers(clubId, 'PENDING_REIMBURSEMENT', token),
        api.adminGetMembers(clubId, token),
        api.adminGetPackageTemplates(clubId, token),
      ]);
      setCaisse(c);
      setOut(resv.summary.outstanding);
      setVouchers(v);
      setMembers(mem);
      setTemplates(tpl.filter((t) => t.isActive));
    } catch (e) { setError((e as Error).message); }
  }, [token, clubId, date]);

  useEffect(() => { if (ready && token && clubId) load(); }, [ready, token, clubId, load]);

  const pickBuyer = async (m: Member) => {
    if (!token || !clubId) return;
    setBuyer(m); setQuery('');
    try { setBuyerPackages(await api.adminGetMemberPackages(clubId, m.userId, token)); }
    catch (e) { setError((e as Error).message); }
  };

  const sell = async () => {
    if (!token || !clubId || !buyer || !sellTplId) return;
    if (sellMethod === 'VOUCHER' && !sellRef.trim()) { setError('Référence du ticket CE requise.'); return; }
    setBusy(true);
    try {
      setError(null);
      await api.adminSellPackage(clubId, buyer.userId, {
        templateId: sellTplId, method: sellMethod,
        payerName: `${buyer.firstName} ${buyer.lastName}`,
        voucherRef: sellMethod === 'VOUCHER' ? sellRef.trim() : undefined,
        voucherIssuer: sellMethod === 'VOUCHER' ? sellIssuer.trim() || undefined : undefined,
      }, token);
      setSellRef(''); setSellIssuer('');
      await Promise.all([load(), pickBuyer(buyer)]);
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };

  const reimburse = async (p: CaissePayment) => {
    if (!token || !clubId) return;
    setBusy(true);
    try { setError(null); await api.adminSetVoucherStatus(clubId, p.id, 'REIMBURSED', token); await load(); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };

  const matches = query.trim().length > 0 && !buyer
    ? members.filter((m) => `${m.firstName} ${m.lastName} ${m.email}`.toLowerCase().includes(query.toLowerCase())).slice(0, 6)
    : [];

  const moneyTotal = caisse
    ? MONEY_METHODS.reduce((s, m) => s + Number(caisse.totalsByMethod[m] ?? 0), 0)
    : 0;

  const input = { border: `1px solid ${th.line}`, background: th.bg, color: th.text, borderRadius: 8, padding: '8px 10px', fontFamily: th.fontUI, fontSize: 14 } as const;
  const card = { background: th.surface, borderRadius: 16, padding: 18, boxShadow: `inset 0 0 0 1px ${th.line}` } as const;
  const sectionTitle = { fontFamily: th.fontUI, fontSize: 13, fontWeight: 700 as const, color: th.text, marginBottom: 12 };
  const stat = (label: string, value: string) => (
    <div>
      <div style={{ fontFamily: th.fontMono, fontSize: 10, fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase', color: th.textFaint }}>{label}</div>
      <div style={{ fontFamily: th.fontDisplay, fontSize: 19, fontWeight: 600, color: th.text }}>{value}</div>
    </div>
  );

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, margin: '0 0 18px', flexWrap: 'wrap' }}>
        <h1 style={{ fontFamily: th.fontDisplay, fontWeight: 600, fontSize: 34, letterSpacing: -0.5, margin: 0, color: th.text }}>Caisse</h1>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={input} />
      </div>

      {error && <div style={{ marginBottom: 16, background: '#ff7a4d', color: '#fff', borderRadius: 12, padding: '11px 14px', fontFamily: th.fontUI, fontSize: 13.5, fontWeight: 600 }}>{error}</div>}

      {/* totaux du jour */}
      <div style={{ ...card, marginBottom: 18 }}>
        <div style={sectionTitle}>Journée du {date}</div>
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          {stat('Encaissé', euro(moneyTotal))}
          {stat('Reste dû (jour)', euro(outstanding))}
          {(Object.entries(caisse?.totalsByMethod ?? {}) as [PaymentMethod, string][]).map(([m, v]) => stat(METHOD_LABEL[m], euro(v)))}
        </div>
        <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {(caisse?.payments ?? []).map((p) => (
            <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, fontFamily: th.fontUI, fontSize: 13, color: th.text, padding: '7px 0', borderTop: `1px solid ${th.line}` }}>
              <span style={{ flex: 1 }}>{paymentLabel(p)}</span>
              <span style={{ color: th.textMute }}>{METHOD_LABEL[p.method]}{p.voucherRef ? ` · ${p.voucherRef}` : ''}</span>
              <b>{euro(p.amount)}</b>
            </div>
          ))}
          {caisse && caisse.payments.length === 0 && <div style={{ fontFamily: th.fontUI, fontSize: 13, color: th.textMute }}>Aucun encaissement ce jour.</div>}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 18 }}>
        {/* vente de carnet / porte-monnaie */}
        <div style={card}>
          <div style={sectionTitle}>Vendre une offre</div>
          <div style={{ position: 'relative', marginBottom: 12 }}>
            {buyer ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, border: `1px solid ${th.line}`, borderRadius: 8, padding: '8px 10px' }}>
                <span style={{ flex: 1, fontFamily: th.fontUI, fontSize: 14, color: th.text }}>{buyer.firstName} {buyer.lastName}</span>
                <button type="button" onClick={() => { setBuyer(null); setBuyerPackages([]); }} style={{ border: 'none', background: th.surface2, cursor: 'pointer', borderRadius: 8, padding: '3px 8px', color: th.textMute, fontSize: 12 }}>Changer</button>
              </div>
            ) : (
              <input type="text" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rechercher un membre…" style={{ ...input, width: '100%', boxSizing: 'border-box' }} />
            )}
            {matches.length > 0 && (
              <div style={{ position: 'absolute', left: 0, right: 0, top: '100%', zIndex: 10, background: th.surface, border: `1px solid ${th.line}`, borderRadius: 8, marginTop: 4, overflow: 'hidden', boxShadow: th.shadowSoft }}>
                {matches.map((m) => (
                  <button key={m.userId} type="button" onClick={() => pickBuyer(m)}
                    style={{ display: 'block', width: '100%', textAlign: 'left', border: 'none', background: 'transparent', cursor: 'pointer', padding: '8px 10px', fontFamily: th.fontUI, fontSize: 13.5, color: th.text }}>
                    {m.firstName} {m.lastName} <span style={{ color: th.textFaint }}>· {m.email}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {buyer && (
            <>
              {buyerPackages.length > 0 && (
                <div style={{ marginBottom: 12, fontFamily: th.fontUI, fontSize: 12.5, color: th.textMute }}>
                  Soldes actuels : {buyerPackages.map((p) => packageLabel(p)).join(' · ')}
                </div>
              )}
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <label style={{ fontSize: 12, color: th.textMute, display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 160 }}>Offre
                  <select value={sellTplId} onChange={(e) => setSellTplId(e.target.value)} style={input}>
                    <option value="">Choisir…</option>
                    {templates.map((t) => <option key={t.id} value={t.id}>{t.name} — {euro(t.price)}</option>)}
                  </select>
                </label>
                <label style={{ fontSize: 12, color: th.textMute, display: 'flex', flexDirection: 'column', gap: 4 }}>Moyen
                  <select value={sellMethod} onChange={(e) => setSellMethod(e.target.value as PaymentMethod)} style={input}>
                    {SALE_METHODS.map((m) => <option key={m} value={m}>{METHOD_LABEL[m]}</option>)}
                  </select>
                </label>
                {sellMethod === 'VOUCHER' && (
                  <>
                    <label style={{ fontSize: 12, color: th.textMute, display: 'flex', flexDirection: 'column', gap: 4 }}>Référence
                      <input type="text" value={sellRef} onChange={(e) => setSellRef(e.target.value)} placeholder="N° du ticket" style={{ ...input, width: 120 }} />
                    </label>
                    <label style={{ fontSize: 12, color: th.textMute, display: 'flex', flexDirection: 'column', gap: 4 }}>Émetteur
                      <input type="text" value={sellIssuer} onChange={(e) => setSellIssuer(e.target.value)} placeholder="ANCV…" style={{ ...input, width: 100 }} />
                    </label>
                  </>
                )}
                <Btn type="button" icon="check" onClick={sell} disabled={busy || !sellTplId}>{busy ? '…' : 'Vendre'}</Btn>
              </div>
            </>
          )}
        </div>

        {/* tickets CE à rembourser */}
        <div style={card}>
          <div style={sectionTitle}>Tickets CE à rembourser ({vouchers.length})</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {vouchers.map((p) => (
              <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, fontFamily: th.fontUI, fontSize: 13, color: th.text, padding: '7px 0', borderTop: `1px solid ${th.line}` }}>
                <span style={{ flex: 1 }}>{paymentLabel(p)}</span>
                <span style={{ color: th.textMute }}>{p.voucherRef}{p.voucherIssuer ? ` · ${p.voucherIssuer}` : ''}</span>
                <b>{euro(p.amount)}</b>
                <button type="button" onClick={() => reimburse(p)} disabled={busy}
                  style={{ border: `1px solid ${th.line}`, background: 'transparent', color: th.text, borderRadius: 9, padding: '5px 10px', cursor: 'pointer', fontFamily: th.fontUI, fontSize: 12, fontWeight: 600 }}>
                  Remboursé
                </button>
              </div>
            ))}
            {vouchers.length === 0 && <div style={{ fontFamily: th.fontUI, fontSize: 13, color: th.textMute }}>Aucun ticket en attente.</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Vérifier compilation + tests**

```bash
npx tsc --noEmit
npm test
```

Expected: OK / PASS.

- [ ] **Step 3: Commit**

```bash
git add app/admin/caisse/page.tsx
git commit -m "feat(caisse): page admin Caisse - recap du jour, vente d'offres, tickets CE"
```

---

### Task 13: Planning admin — panneau Encaisser étendu

**Files:**
- Modify: `frontend/app/admin/planning/page.tsx`

- [ ] **Step 1: Étendre les états et le chargement des soldes**

Dans `frontend/app/admin/planning/page.tsx` :

1. Ajouter aux imports : `MemberPackage` depuis `@/lib/api`, et `packageLabel, isUsable, canCover` depuis `@/lib/packages`.

2. Remplacer la constante `METHOD_LABEL` (ligne 17) — les prépayés ne vont PAS dans le select (boutons dédiés) :

```typescript
const METHOD_LABEL: Record<string, string> = { CASH: 'Espèces', CARD: 'Carte', TRANSFER: 'Virement', ONLINE: 'En ligne', VOUCHER: 'Ticket CE', OTHER: 'Autre' };
```

3. Ajouter les états (après `payForm`) :

```typescript
  const [voucherRef, setVoucherRef]     = useState('');
  const [voucherIssuer, setVoucherIssuer] = useState('');
  const [selPackages, setSelPackages]   = useState<MemberPackage[]>([]);
```

4. Dans `openRes`, après `setPayForm(...)`, charger les soldes du joueur :

```typescript
    setVoucherRef(''); setVoucherIssuer('');
    setSelPackages([]);
    if (rv.user && token && clubId) {
      api.adminGetMemberPackages(clubId, rv.user.id, token)
        .then((pkgs) => setSelPackages(pkgs.filter((p) => isUsable(p))))
        .catch(() => setSelPackages([]));
    }
```

- [ ] **Step 2: Étendre addPayment et ajouter le paiement par package**

1. Remplacer la fonction `addPayment` :

```typescript
  const addPayment = async () => {
    if (!token || !clubId || !selected) return;
    const amount = Number(payForm.amount);
    if (!amount || amount <= 0) { setError('Montant invalide.'); return; }
    if (payForm.method === 'VOUCHER' && !voucherRef.trim()) { setError('Référence du ticket CE requise.'); return; }
    setBusy(true);
    try {
      setError(null);
      await api.adminAddPayment(clubId, selected.id, {
        amount, method: payForm.method,
        voucherRef: payForm.method === 'VOUCHER' ? voucherRef.trim() : undefined,
        voucherIssuer: payForm.method === 'VOUCHER' ? voucherIssuer.trim() || undefined : undefined,
      }, token);
      setSelected(null); await load();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };

  // Solde la résa avec un package du joueur (1 entrée de carnet, ou débit du porte-monnaie).
  const payWithPackage = async (pkg: MemberPackage) => {
    if (!token || !clubId || !selected) return;
    const remaining = Math.max(0, Number(selected.totalPrice) - Number(selected.paidAmount));
    if (remaining <= 0) { setError('Rien à encaisser.'); return; }
    setBusy(true);
    try {
      setError(null);
      await api.adminAddPayment(clubId, selected.id, {
        amount: remaining,
        method: pkg.kind === 'ENTRIES' ? 'PACK_CREDIT' : 'WALLET',
        sourcePackageId: pkg.id,
      }, token);
      setSelected(null); await load();
    } catch (e) {
      setError((e as Error).message === 'INSUFFICIENT_BALANCE' ? 'Solde du package insuffisant.' : (e as Error).message);
    }
    finally { setBusy(false); }
  };
```

- [ ] **Step 3: Étendre le bloc « encaissement rapide » de la modale**

Remplacer le bloc `{/* encaissement rapide */}` (lignes 433-446) par :

```tsx
            {/* encaissement rapide */}
            {selected.status !== 'CANCELLED' && (
              <div style={{ marginTop: 16 }}>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
                  <label style={{ fontSize: 12, color: th.textMute, display: 'flex', flexDirection: 'column', gap: 4 }}>Encaisser €
                    <input type="number" min={0} step="0.5" value={payForm.amount} onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })} style={{ border: `1px solid ${th.line}`, background: th.bg, color: th.text, borderRadius: 8, padding: '7px 10px', fontFamily: th.fontUI, fontSize: 14, width: 90 }} />
                  </label>
                  <label style={{ fontSize: 12, color: th.textMute, display: 'flex', flexDirection: 'column', gap: 4 }}>Moyen
                    <select value={payForm.method} onChange={(e) => setPayForm({ ...payForm, method: e.target.value as PaymentMethod })} style={{ border: `1px solid ${th.line}`, background: th.bg, color: th.text, borderRadius: 8, padding: '7px 10px', fontFamily: th.fontUI, fontSize: 14 }}>
                      {Object.keys(METHOD_LABEL).map((m) => <option key={m} value={m}>{METHOD_LABEL[m]}</option>)}
                    </select>
                  </label>
                  {payForm.method === 'VOUCHER' && (
                    <>
                      <label style={{ fontSize: 12, color: th.textMute, display: 'flex', flexDirection: 'column', gap: 4 }}>Référence
                        <input type="text" value={voucherRef} onChange={(e) => setVoucherRef(e.target.value)} placeholder="N° ticket" style={{ border: `1px solid ${th.line}`, background: th.bg, color: th.text, borderRadius: 8, padding: '7px 10px', fontFamily: th.fontUI, fontSize: 14, width: 100 }} />
                      </label>
                      <label style={{ fontSize: 12, color: th.textMute, display: 'flex', flexDirection: 'column', gap: 4 }}>Émetteur
                        <input type="text" value={voucherIssuer} onChange={(e) => setVoucherIssuer(e.target.value)} placeholder="ANCV…" style={{ border: `1px solid ${th.line}`, background: th.bg, color: th.text, borderRadius: 8, padding: '7px 10px', fontFamily: th.fontUI, fontSize: 14, width: 90 }} />
                      </label>
                    </>
                  )}
                  <Btn onClick={addPayment} icon="check" disabled={busy}>{busy ? '…' : 'Encaisser'}</Btn>
                </div>
                {selPackages.length > 0 && (
                  <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {selPackages.map((p) => {
                      const remaining = Math.max(0, Number(selected.totalPrice) - Number(selected.paidAmount));
                      const ok = canCover(p, remaining);
                      return (
                        <button key={p.id} type="button" disabled={busy || !ok} onClick={() => payWithPackage(p)}
                          title={ok ? 'Solder avec ce package' : 'Solde insuffisant'}
                          style={{ border: `1.5px solid ${th.line}`, background: th.surface2, borderRadius: 10, padding: '7px 12px', cursor: ok ? 'pointer' : 'default', opacity: ok ? 1 : 0.5, fontFamily: th.fontUI, fontSize: 13, fontWeight: 600, color: th.text }}>
                          {packageLabel(p)}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
```

- [ ] **Step 4: Vérifier compilation + tests**

```bash
npx tsc --noEmit
npm test
```

Expected: OK / PASS.

- [ ] **Step 5: Commit**

```bash
git add app/admin/planning/page.tsx
git commit -m "feat(caisse): panneau Encaisser - ticket CE + paiement par carnet/porte-monnaie"
```

---

### Task 14: Joueur — soldes sur Réserver + payer avec son carnet

**Files:**
- Modify: `frontend/components/BookingModal.tsx`
- Modify: `frontend/components/ClubReserve.tsx`
- Test: `frontend/__tests__/BookingModal.packages.test.tsx`

- [ ] **Step 1: Écrire le test qui échoue**

Créer `frontend/__tests__/BookingModal.packages.test.tsx` (suivre la structure des mocks de `frontend/__tests__/BookingModal.test.tsx` existant — reprendre tels quels ses mocks de ThemeProvider/api en y ajoutant `confirmReservation`) :

```typescript
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import BookingModal from '@/components/BookingModal';
import { api } from '@/lib/api';

jest.mock('@/lib/api', () => ({
  api: {
    holdSlot: jest.fn(),
    confirmReservation: jest.fn(),
    cancelReservation: jest.fn(),
    rescheduleReservation: jest.fn(),
  },
}));

const slot = { startTime: '2026-06-15T08:00:00.000Z', endTime: '2026-06-15T09:00:00.000Z', available: true, pricePerHour: '25', offPeak: false };
const pkg = {
  id: 'pkg-1', kind: 'ENTRIES' as const, creditsTotal: 10, creditsRemaining: 7,
  amountTotal: null, amountRemaining: null, purchasedAt: '2026-06-01T00:00:00Z',
  expiresAt: null, template: { name: '10 entrées' },
};

function openPending() {
  (api.holdSlot as jest.Mock).mockResolvedValue({ id: 'res-1', status: 'PENDING' });
  render(
    <BookingModal slot={slot} resourceId="court-1" pricePerHour="25" duration={60}
      token="tok" packages={[pkg]} onClose={() => {}} onConfirmed={() => {}} />,
  );
  fireEvent.click(screen.getByText('Pré-réserver'));
}

describe('BookingModal — paiement par carnet', () => {
  it('propose le carnet en phase pending et confirme avec paymentSource', async () => {
    (api.confirmReservation as jest.Mock).mockResolvedValue({ id: 'res-1', status: 'CONFIRMED' });
    openPending();

    const option = await screen.findByText(/Carnet — 7 entrées/);
    fireEvent.click(option);
    fireEvent.click(screen.getByText(/Confirmer/));

    await waitFor(() => {
      expect(api.confirmReservation).toHaveBeenCalledWith('res-1', 'tok', { packageId: 'pkg-1' });
    });
  });

  it('confirme sans paymentSource si « Régler au club » reste sélectionné', async () => {
    (api.confirmReservation as jest.Mock).mockResolvedValue({ id: 'res-1', status: 'CONFIRMED' });
    openPending();

    await screen.findByText(/Régler au club/);
    fireEvent.click(screen.getByText(/Confirmer/));

    await waitFor(() => {
      expect(api.confirmReservation).toHaveBeenCalledWith('res-1', 'tok', undefined);
    });
  });
});
```

NB : si le mock du ThemeProvider du fichier `BookingModal.test.tsx` existant est nécessaire au rendu, le recopier en tête de ce fichier.

- [ ] **Step 2: Vérifier l'échec**

```bash
npm test -- BookingModal.packages
```

Expected: FAIL — la prop `packages` n'existe pas / l'option n'apparaît pas.

- [ ] **Step 3: Étendre BookingModal**

Dans `frontend/components/BookingModal.tsx` :

1. Imports :

```typescript
import { api, TimeSlot, Reservation, MemberPackage } from '@/lib/api';
import { packageLabel, canCover } from '@/lib/packages';
```

2. Props — ajouter dans `BookingModalProps` :

```typescript
  /** Soldes prépayés utilisables du joueur sur ce club (option « payer avec mon carnet »). */
  packages?: MemberPackage[];
```

et le déstructurer dans la signature du composant (`packages = []`).

3. État (après `errorMsg`) :

```typescript
  const [paySource, setPaySource] = useState<string | null>(null); // id du package choisi, null = régler au club
```

4. Remplacer `handleConfirm` :

```typescript
  const handleConfirm = async () => {
    if (!reservation) return;
    try {
      const confirmed = await api.confirmReservation(
        reservation.id, token,
        paySource ? { packageId: paySource } : undefined,
      );
      onConfirmed(confirmed);
    } catch (err) {
      const msg = (err as Error).message;
      if (msg === 'INSUFFICIENT_BALANCE') {
        // La résa reste PENDING : on retire l'option et on laisse confirmer autrement.
        setPaySource(null);
        setErrorMsg('Solde insuffisant — réglez au club.');
        return;
      }
      setPhase('error');
      setErrorMsg(msg === 'SLOT_NO_LONGER_AVAILABLE' ? 'Ce créneau a été pris entre-temps. Veuillez recommencer.' : msg);
    }
  };
```

5. Dans le rendu de la phase `pending`, juste avant le `<div style={{ display: 'flex', gap: 11, marginTop: 22 }}>` :

```tsx
            {(packages.length > 0 || errorMsg) && (
              <div style={{ marginTop: 16 }}>
                {errorMsg && phase === 'pending' && (
                  <div style={{ fontFamily: th.fontUI, fontSize: 12.5, color: th.onAccent, background: th.accent, padding: '8px 12px', borderRadius: 10, fontWeight: 600, marginBottom: 10 }}>{errorMsg}</div>
                )}
                {packages.length > 0 && (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
                    <button type="button" onClick={() => setPaySource(null)}
                      style={{ border: `1.5px solid ${paySource === null ? th.accent : th.lineStrong}`, background: paySource === null ? th.surface2 : 'transparent', borderRadius: 10, padding: '7px 12px', cursor: 'pointer', fontFamily: th.fontUI, fontSize: 12.5, fontWeight: 600, color: th.text }}>
                      Régler au club
                    </button>
                    {packages.map((p) => {
                      const ok = canCover(p, Number(totalPrice));
                      return (
                        <button key={p.id} type="button" disabled={!ok} onClick={() => setPaySource(p.id)}
                          style={{ border: `1.5px solid ${paySource === p.id ? th.accent : th.lineStrong}`, background: paySource === p.id ? th.surface2 : 'transparent', borderRadius: 10, padding: '7px 12px', cursor: ok ? 'pointer' : 'default', opacity: ok ? 1 : 0.5, fontFamily: th.fontUI, fontSize: 12.5, fontWeight: 600, color: th.text }}>
                          {packageLabel(p)}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
```

6. Le libellé du bouton de confirmation devient dynamique — remplacer `Confirmer et payer` par :

```tsx
{paySource ? 'Confirmer avec mon solde' : 'Confirmer et payer'}
```

- [ ] **Step 4: Brancher ClubReserve (chargement des soldes + chips)**

Dans `frontend/components/ClubReserve.tsx` :

1. Imports : ajouter `MemberPackage` à l'import de `@/lib/api`, et :

```typescript
import { packageLabel } from '@/lib/packages';
```

2. État + chargement (près des autres états ; `club` et `token` existent déjà dans le composant) :

```typescript
  const [myPackages, setMyPackages] = useState<MemberPackage[]>([]);

  useEffect(() => {
    if (!token) { setMyPackages([]); return; }
    api.getMyClubPackages(club.slug, token).then(setMyPackages).catch(() => setMyPackages([]));
  }, [token, club.slug]);
```

3. Affichage des soldes — sous la `ClubNav` (au-dessus de la grille des créneaux), ajouter :

```tsx
      {myPackages.length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '10px 0 0' }}>
          {myPackages.map((p) => (
            <Chip key={p.id}>{packageLabel(p)}</Chip>
          ))}
        </div>
      )}
```

(`Chip` est déjà importé depuis `@/components/ui/atoms` dans ce fichier ; adapter la position exacte au JSX existant.)

4. Passer les soldes au modal — dans le rendu de `<BookingModal …>` (ligne ~268), ajouter :

```tsx
          packages={moveRes ? [] : myPackages}
```

(pas d'option carnet en mode déplacement : le backend `reschedule` ne consomme pas de package en v1).

- [ ] **Step 5: Vérifier que les tests passent**

```bash
npm test
npx tsc --noEmit
```

Expected: PASS — y compris `BookingModal.test.tsx` et `ClubReserve.*.test.tsx` existants (la prop `packages` est optionnelle ; si un test ClubReserve échoue parce que `api.getMyClubPackages` n'est pas mocké, ajouter `getMyClubPackages: jest.fn().mockResolvedValue([])` à son mock de `api`).

- [ ] **Step 6: Commit**

```bash
git add components/BookingModal.tsx components/ClubReserve.tsx __tests__/BookingModal.packages.test.tsx
git commit -m "feat(caisse): joueur - soldes sur Reserver + payer avec carnet/porte-monnaie"
```

---

### Task 15: CLAUDE.md + vérification finale

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Documenter la fonctionnalité dans CLAUDE.md**

Ajouter après la section « Calendrier “Mes réservations” … » :

```markdown
## Caisse & carnets (v1) ✅ implémenté

Paiements en caisse + formules prépayées. Modèles : `PackageTemplate` (offre du club, `kind` ENTRIES|WALLET, prix, entrées ou montant crédité, validité opt.) et `MemberPackage` (solde vivant d'un joueur, `creditsRemaining`/`amountRemaining`), `Payment` étendu (migration `add_packages_caisse` : `reservationId` **optionnel**, `clubId` backfillé, `memberPackageId` = vente, `sourcePackageId` = consommation, `voucherRef/Issuer/Status`) et `PaymentMethod` + `VOUCHER`/`PACK_CREDIT`/`WALLET`. Concurrence : consommation par **décrément conditionnel** (`PackageService.consume`, updateMany `count===0` → `INSUFFICIENT_BALANCE`) — à la confirmation en ligne, dans la **même transaction Serializable** (`confirmReservation(…, paymentSource)`), échec = résa reste PENDING payable autrement. Backend : `PackageService` + routes admin `/packages/templates`, `/members/:userId/packages` (vente encaissée transactionnelle), `/caisse?date=` (totaux par méthode, fuseau club), `/caisse/vouchers` + `PATCH /payments/:id/voucher` (suivi remboursement tickets CE) ; joueur `GET /api/clubs/:slug/me/packages`. Frontend : `/admin/packages` (offres), `/admin/caisse` (récap jour + vente + vouchers), panneau « Encaisser » du planning (ticket CE avec référence, boutons carnet/porte-monnaie avec solde), BookingModal « payer avec mon solde », chips de soldes sur Réserver ; helpers purs `lib/packages.ts`. Pas de paiement CB en ligne ; pas de remboursement auto à l'annulation (recrédit manuel). Brief : `docs/superpowers/briefs/2026-06-10-paiements-caisse.md`.
```

Et dans la section « À implémenter (pas encore fait) », ajouter une ligne :

```markdown
- Caisse — évolutions : recrédit auto à l'annulation, export comptable, consommation de package lors d'un déplacement de résa
```

- [ ] **Step 2: Vérification finale complète**

```bash
# backend/
npm test
npx tsc --noEmit
# frontend/
npm test
npx tsc --noEmit
```

Expected: tout PASS. Vérification manuelle rapide (serveurs lancés) :

```bash
curl http://localhost:3001/health
# créer une offre, vendre, encaisser — via l'UI /admin/packages, /admin/caisse, /admin/planning
```

- [ ] **Step 3: Commit final**

```bash
git add CLAUDE.md docs/superpowers/plans/2026-06-10-paiements-caisse.md
git commit -m "docs: CLAUDE.md - section Caisse & carnets (v1) + plan d'implementation"
```

---

## Couverture du brief (self-check)

| Exigence du brief | Tâche(s) |
|---|---|
| Offres ENTRIES + WALLET, validité, gestion back-office | 1, 2, 11 |
| Vente en caisse (annuaire membre, encaissement, décréments concurrent-sûrs) | 3, 4, 7, 12 |
| Encaissement résa : Ticket CE (réf+émetteur), Carnet, Porte-monnaie, multi-paiements conservés | 5, 7, 13 |
| Vouchers : statut à rembourser/remboursé + vue dédiée | 6, 7, 12 |
| Caisse du jour : totaux par méthode, liste, reste dû | 6, 7, 12 |
| Joueur : voir ses soldes + payer à la confirmation (transaction Serializable, échec sans demi-état) | 8, 9, 14 |
| Migration additive, routes club-scopées, pas de CB en ligne, pas de remboursement auto, tests Jest, CLAUDE.md | 1, 7, 15 (tests : 2-6, 8, 10, 14) |
