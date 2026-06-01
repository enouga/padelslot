import { Prisma } from '@prisma/client';
import { prisma } from '../db/prisma';
import { redis } from '../redis/client';
import { SSEService } from './sse.service';

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

  async holdSlot({ resourceId, userId, startTime, endTime }: HoldSlotParams) {
    const lockKey = this.lockKey(resourceId, startTime);

    const acquired = await redis.set(lockKey, userId, 'EX', HOLD_TTL_SECONDS, 'NX');
    if (!acquired) throw new Error('SLOT_ALREADY_HELD');

    try {
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

      const resource = await prisma.resource.findUniqueOrThrow({
        where: { id: resourceId },
        select: { pricePerHour: true },
      });

      const durationHours = (endTime.getTime() - startTime.getTime()) / 3_600_000;
      const totalPrice = new Prisma.Decimal(Number(resource.pricePerHour) * durationHours);

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
      },
    });

    let total     = new Prisma.Decimal(0);
    let paidTotal = new Prisma.Decimal(0);
    for (const r of reservations) {
      total = total.plus(r.totalPrice);
      if (r.status === 'CONFIRMED') paidTotal = paidTotal.plus(r.totalPrice);
    }

    return {
      reservations,
      summary: { total: total.toFixed(2), paidTotal: paidTotal.toFixed(2) },
    };
  }
}
