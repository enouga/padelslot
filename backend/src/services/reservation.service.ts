import { Prisma, ReservationType } from '@prisma/client';
import { DateTime } from 'luxon';
import { prisma } from '../db/prisma';
import { redis } from '../redis/client';
import { SSEService } from './sse.service';
import { effectiveRate, PeakHours } from './pricing';
import { PackageService } from './package.service';

interface HoldSlotParams {
  resourceId: string;
  userId: string;
  startTime: Date;
  endTime: Date;
}

const HOLD_TTL_SECONDS = 600; // 10 minutes
const HOLD_EXPIRY_MS = HOLD_TTL_SECONDS * 1000;

export class ReservationService {
  private lockKey(resourceId: string, startTime: Date): string {
    return `lock:resource:${resourceId}:${startTime.toISOString()}`;
  }

  /**
   * Gating « membre = peut réserver » + fenêtre de réservation.
   * - Membership BLOCKED → refus (MEMBERSHIP_BLOCKED).
   * - Fenêtre élargie si le membre est abonné (isSubscriber).
   * - Adhésion automatique (ACTIVE) au 1er accès/réservation si absente.
   */
  private async assertMembershipAndWindow(
    resource: { clubId: string; club: { timezone: string; publicBookingDays: number; memberBookingDays: number } },
    userId: string,
    startTime: Date,
  ) {
    const where = { userId_clubId: { userId, clubId: resource.clubId } };
    const membership = await prisma.clubMembership.findUnique({ where });
    if (membership?.status === 'BLOCKED') throw new Error('MEMBERSHIP_BLOCKED');

    const isSubscriber = membership?.isSubscriber ?? false;
    const windowDays = isSubscriber ? resource.club.memberBookingDays : resource.club.publicBookingDays;
    const tz = resource.club.timezone;
    const maxDate = DateTime.now().setZone(tz).startOf('day').plus({ days: windowDays }).endOf('day');
    const startLocal = DateTime.fromJSDate(startTime).setZone(tz);
    if (startLocal > maxDate) throw new Error('BOOKING_TOO_FAR');

    if (!membership) {
      await prisma.clubMembership.create({ data: { userId, clubId: resource.clubId } });
    }
  }

  async holdSlot({ resourceId, userId, startTime, endTime }: HoldSlotParams) {
    const lockKey = this.lockKey(resourceId, startTime);

    const acquired = await redis.set(lockKey, userId, 'EX', HOLD_TTL_SECONDS, 'NX');
    if (!acquired) throw new Error('SLOT_ALREADY_HELD');

    try {
      const resource = await prisma.resource.findUniqueOrThrow({
        where: { id: resourceId },
        select: {
          pricePerHour: true,
          offPeakPricePerHour: true,
          clubId: true,
          club: { select: { timezone: true, peakHours: true, publicBookingDays: true, memberBookingDays: true } },
        },
      });

      await this.assertMembershipAndWindow(resource, userId, startTime);

      const tenMinutesAgo = new Date(Date.now() - HOLD_EXPIRY_MS);

      const conflicts = await prisma.reservation.count({
        where: {
          resourceId,
          OR: [
            { status: 'CONFIRMED' },
            { status: 'PENDING', createdAt: { gt: tenMinutesAgo } },
          ],
          startTime: { lt: endTime },
          endTime: { gt: startTime },
        },
      });

      if (conflicts > 0) {
        await redis.del(lockKey);
        throw new Error('SLOT_NOT_AVAILABLE');
      }

      const local = DateTime.fromJSDate(startTime, { zone: resource.club.timezone });
      const { rate } = effectiveRate(
        resource.club.peakHours as PeakHours | null,
        local.weekday, local.hour,
        Number(resource.pricePerHour),
        resource.offPeakPricePerHour != null ? Number(resource.offPeakPricePerHour) : null,
      );
      const durationHours = (endTime.getTime() - startTime.getTime()) / 3_600_000;
      const totalPrice = new Prisma.Decimal(rate * durationHours);

      const reservation = await prisma.reservation.create({
        data: { resourceId, userId, startTime, endTime, status: 'PENDING', totalPrice },
      });

      SSEService.getInstance().broadcast(resourceId, {
        type: 'slot_held',
        resourceId,
        reservationId: reservation.id,
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
        expiresAt: new Date(Date.now() + HOLD_EXPIRY_MS).toISOString(),
      });

      return reservation;

    } catch (err) {
      if ((err as Error).message !== 'SLOT_NOT_AVAILABLE') {
        await redis.del(lockKey);
      }
      throw err;
    }
  }

  async confirmReservation(reservationId: string, userId: string) {
    const reservation = await prisma.reservation.findUnique({
      where: { id: reservationId },
    });

    if (!reservation)                     throw new Error('RESERVATION_NOT_FOUND');
    if (reservation.userId !== userId)    throw new Error('UNAUTHORIZED');
    if (reservation.status !== 'PENDING') throw new Error('RESERVATION_NOT_PENDING');

    const age = Date.now() - reservation.createdAt.getTime();
    if (age > HOLD_EXPIRY_MS)             throw new Error('RESERVATION_NOT_PENDING');

    const confirmed = await prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<any[]>`
        SELECT id, status, resource_id, start_time, end_time
        FROM reservations WHERE id = ${reservationId} FOR UPDATE
      `;

      if (!locked[0] || locked[0].status !== 'PENDING') {
        throw new Error('RESERVATION_NOT_PENDING');
      }

      // Pas de FOR UPDATE ici : illégal sur un agrégat en PostgreSQL, et inutile —
      // l'isolation Serializable protège déjà des conflits fantômes concurrents.
      const conflicts = await tx.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(*) as count FROM reservations
        WHERE resource_id = ${locked[0].resource_id}
          AND id        != ${reservationId}
          AND status    = 'CONFIRMED'
          AND start_time < ${locked[0].end_time}
          AND end_time   > ${locked[0].start_time}
      `;

      if (Number(conflicts[0].count) > 0) throw new Error('SLOT_NO_LONGER_AVAILABLE');

      return tx.reservation.update({
        where: { id: reservationId },
        data:  { status: 'CONFIRMED' },
      });
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      timeout: 10_000,
    });

    await redis.del(this.lockKey(confirmed.resourceId, confirmed.startTime));

    SSEService.getInstance().broadcast(confirmed.resourceId, {
      type: 'slot_confirmed',
      resourceId:    confirmed.resourceId,
      reservationId: confirmed.id,
      startTime:     confirmed.startTime.toISOString(),
      endTime:       confirmed.endTime.toISOString(),
    });

    return confirmed;
  }

  /**
   * Déplacement atomique d'une réservation par son propriétaire : la nouvelle
   * résa est créée CONFIRMED et l'ancienne passée en CANCELLED dans la même
   * transaction Serializable — tout échec laisse l'ancienne intacte.
   * Intra-club uniquement ; le créneau cible est revalidé intégralement
   * (heures ouvrées, fenêtre, membership, conflits) car il vient du client.
   */
  async rescheduleReservation(
    reservationId: string,
    userId: string,
    params: { resourceId: string; startTime: Date; duration: number },
  ) {
    const old = await prisma.reservation.findUnique({
      where: { id: reservationId },
      include: { resource: { select: { clubId: true } } },
    });
    if (!old)                          throw new Error('RESERVATION_NOT_FOUND');
    if (old.userId !== userId)         throw new Error('UNAUTHORIZED');
    if (old.status !== 'PENDING' && old.status !== 'CONFIRMED')
                                       throw new Error('RESERVATION_NOT_ACTIVE');
    if (old.startTime.getTime() <= Date.now()) throw new Error('RESERVATION_IN_PAST');

    const { resourceId, startTime, duration } = params;
    if (!Number.isFinite(duration) || duration <= 0 || duration % 30 !== 0
        || isNaN(startTime.getTime()) || startTime.getTime() <= Date.now()) {
      throw new Error('VALIDATION_ERROR');
    }
    const endTime = new Date(startTime.getTime() + duration * 60_000);

    const resource = await prisma.resource.findUnique({
      where: { id: resourceId },
      select: {
        clubId: true, openHour: true, closeHour: true,
        pricePerHour: true, offPeakPricePerHour: true,
        club: { select: { timezone: true, peakHours: true, publicBookingDays: true, memberBookingDays: true } },
      },
    });
    if (!resource)                              throw new Error('RESOURCE_NOT_FOUND');
    if (resource.clubId !== old.resource.clubId) throw new Error('CLUB_MISMATCH');

    // Heures ouvrées en heure locale du club — holdSlot s'en dispense car ses
    // créneaux viennent d'AvailabilityService ; ici le créneau vient du client.
    const startLocal = DateTime.fromJSDate(startTime).setZone(resource.club.timezone);
    const endLocal   = DateTime.fromJSDate(endTime).setZone(resource.club.timezone);
    const open  = startLocal.startOf('day').set({ hour: resource.openHour });
    const close = startLocal.startOf('day').set({ hour: resource.closeHour });
    if (startLocal < open || endLocal > close) throw new Error('OUT_OF_HOURS');

    await this.assertMembershipAndWindow(resource, userId, startTime);

    // Lock du nouveau créneau — sauf clé identique à l'ancienne (changement de
    // durée seule) : le SET NX échouerait contre notre propre résa.
    const newLock = this.lockKey(resourceId, startTime);
    const sameKey = newLock === this.lockKey(old.resourceId, old.startTime);
    if (!sameKey) {
      const acquired = await redis.set(newLock, userId, 'EX', HOLD_TTL_SECONDS, 'NX');
      if (!acquired) throw new Error('SLOT_ALREADY_HELD');
    }

    try {
      const { rate } = effectiveRate(
        resource.club.peakHours as PeakHours | null,
        startLocal.weekday, startLocal.hour,
        Number(resource.pricePerHour),
        resource.offPeakPricePerHour != null ? Number(resource.offPeakPricePerHour) : null,
      );
      const totalPrice = new Prisma.Decimal(rate * (duration / 60));

      const tenMinutesAgo = new Date(Date.now() - HOLD_EXPIRY_MS);
      const created = await prisma.$transaction(async (tx) => {
        const locked = await tx.$queryRaw<any[]>`
          SELECT id, status FROM reservations WHERE id = ${reservationId} FOR UPDATE
        `;
        if (!locked[0] || (locked[0].status !== 'PENDING' && locked[0].status !== 'CONFIRMED')) {
          throw new Error('RESERVATION_NOT_ACTIVE');
        }

        // id != reservationId : déplacer vers un créneau qui chevauche
        // l'ancienne résa doit fonctionner (ex. décalage de 30 min).
        const conflicts = await tx.reservation.count({
          where: {
            resourceId,
            id: { not: reservationId },
            OR: [
              { status: 'CONFIRMED' },
              { status: 'PENDING', createdAt: { gt: tenMinutesAgo } },
            ],
            startTime: { lt: endTime },
            endTime:   { gt: startTime },
          },
        });
        if (conflicts > 0) throw new Error('SLOT_NOT_AVAILABLE');

        const next = await tx.reservation.create({
          data: { resourceId, userId, startTime, endTime, status: 'CONFIRMED', totalPrice },
        });
        await tx.reservation.update({
          where: { id: reservationId },
          data:  { status: 'CANCELLED', cancelledAt: new Date() },
        });
        return next;
      }, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        timeout: 10_000,
      });

      await redis.del(this.lockKey(old.resourceId, old.startTime));
      if (!sameKey) await redis.del(newLock); // la ligne CONFIRMED protège désormais le créneau

      SSEService.getInstance().broadcast(old.resourceId, {
        type: 'slot_released',
        resourceId:    old.resourceId,
        reservationId: old.id,
        startTime:     old.startTime.toISOString(),
        endTime:       old.endTime.toISOString(),
      });
      SSEService.getInstance().broadcast(resourceId, {
        type: 'slot_confirmed',
        resourceId,
        reservationId: created.id,
        startTime:     created.startTime.toISOString(),
        endTime:       created.endTime.toISOString(),
      });

      return created;

    } catch (err) {
      if (!sameKey) await redis.del(newLock);
      throw err;
    }
  }

  /**
   * Effets de bord communs à toute annulation : passage en CANCELLED,
   * suppression du lock Redis, et broadcast SSE slot_released.
   */
  private async performCancel(reservation: {
    id: string; resourceId: string; startTime: Date; endTime: Date;
  }) {
    const cancelled = await prisma.reservation.update({
      where: { id: reservation.id },
      data:  { status: 'CANCELLED', cancelledAt: new Date() },
    });

    await redis.del(this.lockKey(reservation.resourceId, reservation.startTime));

    SSEService.getInstance().broadcast(reservation.resourceId, {
      type: 'slot_released',
      resourceId:    reservation.resourceId,
      reservationId: cancelled.id,
      startTime:     reservation.startTime.toISOString(),
      endTime:       reservation.endTime.toISOString(),
    });

    return cancelled;
  }

  async cancelReservation(reservationId: string, userId: string) {
    const reservation = await prisma.reservation.findUnique({
      where: { id: reservationId },
    });

    if (!reservation)                       throw new Error('RESERVATION_NOT_FOUND');
    if (reservation.userId !== userId)      throw new Error('UNAUTHORIZED');
    if (reservation.status === 'CANCELLED') throw new Error('ALREADY_CANCELLED');

    return this.performCancel(reservation);
  }

  /** Annulation par un gestionnaire : n'importe quelle résa d'une ressource de SON club. */
  async adminCancelReservation(reservationId: string, adminClubId: string) {
    const reservation = await prisma.reservation.findUnique({
      where: { id: reservationId },
      include: { resource: { select: { clubId: true } } },
    });

    if (!reservation)                              throw new Error('RESERVATION_NOT_FOUND');
    if (reservation.resource.clubId !== adminClubId) throw new Error('CLUB_MISMATCH');
    if (reservation.status === 'CANCELLED')        throw new Error('ALREADY_CANCELLED');

    return this.performCancel(reservation);
  }

  /**
   * Création par un gestionnaire depuis le planning : réservation CONFIRMED qui bloque
   * le créneau. Type libre (Terrain/Coaching/Tournoi/Événement), membre optionnel
   * (sinon userId = null), intitulé optionnel. Non soumise aux limites joueur.
   * Le membre rattaché n'a pas besoin d'être ACTIVE : l'admin peut réserver pour
   * n'importe quel membre du club (override volontaire, contrairement au flux joueur).
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
    const totalPrice = new Prisma.Decimal(price ?? 0); // négatif déjà rejeté plus haut

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
      startTime: created.startTime.toISOString(),
      endTime: created.endTime.toISOString(),
    });

    return created;
  }

  /** Change le type d'une réservation (Terrain/Coaching/Tournoi/Événement). Vérifie le club. */
  async setReservationType(reservationId: string, adminClubId: string, type: ReservationType) {
    const reservation = await prisma.reservation.findUnique({
      where: { id: reservationId },
      include: { resource: { select: { clubId: true } } },
    });
    if (!reservation)                                throw new Error('RESERVATION_NOT_FOUND');
    if (reservation.resource.clubId !== adminClubId) throw new Error('CLUB_MISMATCH');
    return prisma.reservation.update({ where: { id: reservationId }, data: { type } });
  }

  /** Réservations d'un joueur (les siennes), pour l'espace « Mes réservations ». */
  async listUserReservations(userId: string) {
    return prisma.reservation.findMany({
      where: { userId },
      orderBy: { startTime: 'desc' },
      include: {
        resource: { select: { id: true, name: true, club: { select: { name: true, slug: true, timezone: true } } } },
      },
    });
  }

  /** Planning club : toutes les réservations d'un club, filtrables. */
  async listClubReservations(params: {
    clubId: string;
    date?: string;
    resourceId?: string;
    status?: 'PENDING' | 'CONFIRMED' | 'CANCELLED';
  }) {
    const where: Prisma.ReservationWhereInput = {
      resource: { clubId: params.clubId },
    };
    if (params.resourceId) where.resourceId = params.resourceId;
    if (params.status)     where.status = params.status;
    if (params.date) {
      const dayStart = new Date(`${params.date}T00:00:00.000Z`);
      const dayEnd   = new Date(`${params.date}T23:59:59.999Z`);
      where.startTime = { lt: dayEnd };
      where.endTime   = { gt: dayStart };
    }

    const reservations = await prisma.reservation.findMany({
      where,
      orderBy: { startTime: 'asc' },
      include: {
        resource: { select: { id: true, name: true } },
        user:     { select: { firstName: true, lastName: true, email: true } },
        payments: {
          select: { id: true, amount: true, method: true, payerName: true, note: true, createdAt: true },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    let total = new Prisma.Decimal(0);
    let paid  = new Prisma.Decimal(0);
    const withPaid = reservations.map((r) => {
      const p = (r.payments ?? []).reduce((s, x) => s.plus(x.amount), new Prisma.Decimal(0));
      if (r.status !== 'CANCELLED') {
        total = total.plus(r.totalPrice);
        paid  = paid.plus(p);
      }
      return { ...r, paidAmount: p.toFixed(2) };
    });
    const outstanding = total.minus(paid);

    return {
      reservations: withPaid,
      summary: {
        total:       total.toFixed(2),
        paid:        paid.toFixed(2),
        paidTotal:   paid.toFixed(2), // compat ascendante
        outstanding: (outstanding.greaterThan(0) ? outstanding : new Prisma.Decimal(0)).toFixed(2),
      },
    };
  }

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
    if (!pkg || pkg.clubId !== params.clubId)                    throw new Error('PACKAGE_NOT_FOUND');
    if (reservation.userId && pkg.userId !== reservation.userId) throw new Error('PACKAGE_NOT_FOUND');
    if ((method === 'PACK_CREDIT') !== (pkg.kind === 'ENTRIES')) throw new Error('VALIDATION_ERROR');

    return prisma.$transaction(async (tx) => {
      await PackageService.consume(tx, pkg, new Prisma.Decimal(params.amount));
      return tx.payment.create({ data: { ...base, sourcePackageId: pkg.id } });
    });
  }
}
