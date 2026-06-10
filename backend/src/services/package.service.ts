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
}
