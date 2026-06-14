import { Prisma, ReservationType } from '@prisma/client';
import { DateTime } from 'luxon';
import { prisma } from '../db/prisma';
import { redis } from '../redis/client';
import { SSEService } from './sse.service';
import { slotPriceCents, classifySlot, OffPeakHours } from './pricing';
import { BookingQuotas } from './quotas';
import { PackageService } from './package.service';
import { playerCount } from '../utils/courtType';
import { notifyMatchPartnersInvited, notifyReservationMemberAssigned } from '../email/notifications';

interface HoldSlotParams {
  resourceId: string;
  userId: string;
  startTime: Date;
  endTime: Date;
  partnerUserIds?: string[];               // partenaires invités (membres du club)
  visibility?: 'PRIVATE' | 'PUBLIC';       // PUBLIC = partie ouverte (rejoignable)
}

const HOLD_TTL_SECONDS = 600; // 10 minutes
const HOLD_EXPIRY_MS = HOLD_TTL_SECONDS * 1000;

export class ReservationService {
  private lockKey(resourceId: string, startTime: Date): string {
    return `lock:resource:${resourceId}:${startTime.toISOString()}`;
  }

  /** Envoi d'email best-effort : un échec est loggé, jamais propagé (ne casse pas l'action). */
  private async safeNotify(fn: () => Promise<void>): Promise<void> {
    try { await fn(); }
    catch (err) { console.error('[reservation] notification échouée', err); }
  }

  /**
   * Lignes participant d'une réservation : l'organisateur (isOrganizer, part = reste
   * au centime) + ses partenaires (part égale). La somme des parts == prix total.
   */
  private splitShares(organizerId: string, partnerIds: string[], priceCents: number) {
    const nb = 1 + partnerIds.length;
    const baseCents = Math.floor(priceCents / nb);
    const organizerCents = priceCents - baseCents * partnerIds.length;
    const dec = (c: number) => new Prisma.Decimal(c).div(100);
    return [
      { userId: organizerId, isOrganizer: true, share: dec(organizerCents) },
      ...partnerIds.map((userId) => ({ userId, isOrganizer: false, share: dec(baseCents) })),
    ];
  }

  private participantRows(reservationId: string, organizerId: string, partnerIds: string[], priceCents: number) {
    return this.splitShares(organizerId, partnerIds, priceCents).map((row) => ({ reservationId, ...row }));
  }

  /**
   * Valide les partenaires invités (membres du club uniquement) : pas de doublon ni
   * l'organisateur lui-même (PARTNER_DUPLICATE), capacité du terrain selon son format
   * (TOO_MANY_PLAYERS), tous membres ACTIVE du club (PARTNER_NOT_MEMBER).
   * Renvoie la liste dédoublonnée des partenaires.
   */
  private async validatePartners(
    organizerId: string, clubId: string, format: string | undefined, partnerUserIds: string[] | undefined,
  ): Promise<string[]> {
    const raw = partnerUserIds ?? [];
    const partners = [...new Set(raw)];
    if (raw.length !== partners.length || partners.includes(organizerId)) {
      throw new Error('PARTNER_DUPLICATE');
    }
    if (1 + partners.length > playerCount(format)) throw new Error('TOO_MANY_PLAYERS');
    if (partners.length > 0) {
      const members = await prisma.clubMembership.findMany({
        where: { clubId, status: 'ACTIVE', userId: { in: partners } },
        select: { userId: true },
      });
      if (members.length !== partners.length) throw new Error('PARTNER_NOT_MEMBER');
    }
    return partners;
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
  ): Promise<{ isSubscriber: boolean }> {
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
    return { isSubscriber };
  }

  /**
   * Quotas de réservations COURT choisis par le club (Club.bookingQuotas).
   * Classe du créneau via classifySlot (creux ssi 100 % des minutes en creuses) ;
   * comptage des résas actives du joueur dans le club (CONFIRMED + PENDING
   * récentes, même filtre que les conflits). UPCOMING = à venir ; WEEKLY =
   * semaine calendaire lun-dim du créneau, fuseau club (résas passées incluses).
   * `excludeReservationId` : la résa déplacée ne compte pas contre elle-même.
   * NB : check hors transaction — deux holds simultanés peuvent dépasser de 1 (accepté).
   */
  private async assertQuota(
    club: { timezone: string; offPeakHours: unknown; bookingQuotas: unknown },
    clubId: string,
    userId: string,
    isSubscriber: boolean,
    startTime: Date,
    endTime: Date,
    excludeReservationId?: string,
  ) {
    const quotas = club.bookingQuotas as BookingQuotas | null;
    if (!quotas) return;

    const off = club.offPeakHours as OffPeakHours | null;
    const tz = club.timezone;
    const cls = classifySlot(off, startTime, endTime, tz);
    const limits = isSubscriber ? quotas.subscriber : quotas.nonSubscriber;
    const limit = cls === 'OFF_PEAK' ? limits?.offPeak : limits?.peak;
    if (limit == null) return;
    const errCode = cls === 'OFF_PEAK' ? 'QUOTA_OFFPEAK_REACHED' : 'QUOTA_PEAK_REACHED';
    if (limit === 0) throw new Error(errCode);

    let window: Prisma.DateTimeFilter;
    if (quotas.model === 'WEEKLY') {
      const weekStart = DateTime.fromJSDate(startTime).setZone(tz).startOf('week'); // Luxon : lundi
      window = { gte: weekStart.toJSDate(), lt: weekStart.plus({ days: 7 }).toJSDate() };
    } else {
      window = { gt: new Date() };
    }

    const tenMinutesAgo = new Date(Date.now() - HOLD_EXPIRY_MS);
    const existing = await prisma.reservation.findMany({
      where: {
        userId,
        type: 'COURT',
        resource: { clubId },
        ...(excludeReservationId ? { id: { not: excludeReservationId } } : {}),
        OR: [
          { status: 'CONFIRMED' },
          { status: 'PENDING', createdAt: { gt: tenMinutesAgo } },
        ],
        startTime: window,
      },
      select: { startTime: true, endTime: true },
    });
    const count = existing.filter((r) => classifySlot(off, r.startTime, r.endTime, tz) === cls).length;
    if (count >= limit) throw new Error(errCode);
  }

  async holdSlot({ resourceId, userId, startTime, endTime, partnerUserIds, visibility }: HoldSlotParams) {
    const lockKey = this.lockKey(resourceId, startTime);

    const acquired = await redis.set(lockKey, userId, 'EX', HOLD_TTL_SECONDS, 'NX');
    if (!acquired) throw new Error('SLOT_ALREADY_HELD');

    try {
      const resource = await prisma.resource.findUniqueOrThrow({
        where: { id: resourceId },
        select: {
          price: true,
          offPeakPrice: true,
          clubId: true,
          attributes: true,
          club: { select: { timezone: true, offPeakHours: true, publicBookingDays: true, memberBookingDays: true, bookingQuotas: true } },
        },
      });

      const { isSubscriber } = await this.assertMembershipAndWindow(resource, userId, startTime);
      await this.assertQuota(resource.club, resource.clubId, userId, isSubscriber, startTime, endTime);

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

      // Partenaires (membres du club) : validés avant création, dans le try → lock relâché si erreur.
      const format = (resource.attributes as { format?: string } | null)?.format;
      const partners = await this.validatePartners(userId, resource.clubId, format, partnerUserIds);

      // Prix du créneau (tarif creux ssi entièrement en heures creuses).
      const priceCents = slotPriceCents(
        resource.club.offPeakHours as OffPeakHours | null,
        startTime, endTime, resource.club.timezone,
        Math.round(Number(resource.price) * 100),
        resource.offPeakPrice != null ? Math.round(Number(resource.offPeakPrice) * 100) : null,
      );
      const totalPrice = new Prisma.Decimal(priceCents).div(100);

      // Résa + lignes participant (organisateur + partenaires) dans une transaction.
      const reservation = await prisma.$transaction(async (tx) => {
        const created = await tx.reservation.create({
          data: { resourceId, userId, startTime, endTime, status: 'PENDING', totalPrice, visibility: visibility === 'PUBLIC' ? 'PUBLIC' : 'PRIVATE' },
        });
        await tx.reservationParticipant.createMany({
          data: this.participantRows(created.id, userId, partners, priceCents),
        });
        return created;
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

  async confirmReservation(
    reservationId: string,
    userId: string,
    paymentSource?: { packageId: string },
  ) {
    const reservation = await prisma.reservation.findUnique({
      where: { id: reservationId },
      include: { resource: { select: { clubId: true } } },
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
        // Attribue le paiement au participant organisateur (le joueur qui confirme/paie).
        const organizer = await tx.reservationParticipant.findFirst({
          where: { reservationId, isOrganizer: true }, select: { id: true },
        });
        await tx.payment.create({
          data: {
            reservationId,
            participantId: organizer?.id ?? null,
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

    // Best-effort : prévenir les partenaires qu'ils ont été ajoutés à la partie.
    await this.safeNotify(() => notifyMatchPartnersInvited(reservationId));

    return confirmed;
  }

  /**
   * Effets de bord communs à toute annulation : passage en CANCELLED,
   * suppression du lock Redis, et broadcast SSE slot_released.
   */
  /** Refuse l'action si on est à moins de `cutoffHours` du début (cutoff 0 = autorisé jusqu'au début). */
  private assertWithinCutoff(startTime: Date, cutoffHours: number, errorCode: string): void {
    const deadline = startTime.getTime() - Math.max(0, cutoffHours) * 3_600_000;
    if (Date.now() > deadline) throw new Error(errorCode);
  }

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
      include: { resource: { select: { club: { select: { cancellationCutoffHours: true } } } } },
    });

    if (!reservation)                       throw new Error('RESERVATION_NOT_FOUND');
    if (reservation.userId !== userId)      throw new Error('UNAUTHORIZED');
    if (reservation.status === 'CANCELLED') throw new Error('ALREADY_CANCELLED');
    this.assertWithinCutoff(reservation.startTime, reservation.resource.club.cancellationCutoffHours, 'CANCELLATION_TOO_LATE');

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

  /** Dû d'une résa en centimes : prix, sinon tarif du terrain (COURT, creux ssi
   * entièrement en heures creuses), sinon 0. Source unique du « montant à régler ». */
  private effectiveDueCents(
    r: { totalPrice: Prisma.Decimal | null; type: ReservationType; startTime: Date; endTime: Date; resource: { price: Prisma.Decimal; offPeakPrice: Prisma.Decimal | null } },
    club: { offPeakHours: Prisma.JsonValue | null; timezone: string },
  ): number {
    const cents = (v: unknown) => { const n = Math.round(Number(v) * 100); return Number.isFinite(n) ? n : 0; };
    let dueC = cents(r.totalPrice);
    if (dueC <= 0) {
      dueC = r.type === 'COURT'
        ? slotPriceCents(
            club.offPeakHours as OffPeakHours | null,
            r.startTime, r.endTime, club.timezone,
            cents(r.resource.price),
            r.resource.offPeakPrice != null ? cents(r.resource.offPeakPrice) : null,
          )
        : 0;
    }
    return dueC;
  }

  /** Sérialise une réservation au format planning/caisse : dueAmount, paidAmount,
   * et le détail par joueur (part / payé / reste). Utilisé par listClubReservations
   * et loadClubReservation pour une forme de sortie identique. */
  private mapReservation<
    R extends {
      totalPrice: Prisma.Decimal | null; type: ReservationType; startTime: Date; endTime: Date;
      resource: { price: Prisma.Decimal; offPeakPrice: Prisma.Decimal | null };
      payments?: Array<{ amount: Prisma.Decimal; participantId: string | null }>;
      participants?: Array<{ id: string; userId: string; share: Prisma.Decimal; isOrganizer: boolean; user: { firstName: string; lastName: string } }>;
    }
  >(r: R, club: { offPeakHours: Prisma.JsonValue | null; timezone: string }) {
    const cents = (v: unknown) => { const n = Math.round(Number(v) * 100); return Number.isFinite(n) ? n : 0; };
    const p = (r.payments ?? []).reduce((s, x) => s.plus(x.amount), new Prisma.Decimal(0));
    const dueC = this.effectiveDueCents(r, club);
    const participants = (r.participants ?? []).map((pp) => {
      const ppPaid = (r.payments ?? []).filter((x) => x.participantId === pp.id).reduce((s, x) => s.plus(x.amount), new Prisma.Decimal(0));
      const shareC = cents(pp.share);
      return {
        id: pp.id, userId: pp.userId, isOrganizer: pp.isOrganizer,
        firstName: pp.user.firstName, lastName: pp.user.lastName,
        share: (shareC / 100).toFixed(2),
        paid: cents(ppPaid) === 0 ? '0.00' : ppPaid.toFixed(2),
        outstanding: (Math.max(0, shareC - cents(ppPaid)) / 100).toFixed(2),
      };
    });
    return { ...r, paidAmount: p.toFixed(2), dueAmount: (dueC / 100).toFixed(2), participants };
  }

  /** Recharge une réservation seule au format planning/caisse (gardes club/existence).
   * Renvoyé par les endpoints d'encaissement pour que le front fasse setSelected sans recharger. */
  private async loadClubReservation(reservationId: string, clubId: string) {
    const r = await prisma.reservation.findUnique({
      where: { id: reservationId },
      include: {
        resource: { select: { id: true, name: true, price: true, offPeakPrice: true, clubId: true } },
        user:     { select: { id: true, firstName: true, lastName: true, email: true } },
        payments: {
          select: { id: true, amount: true, method: true, payerName: true, note: true, createdAt: true, participantId: true },
          orderBy: { createdAt: 'asc' },
        },
        participants: {
          orderBy: { joinedAt: 'asc' },
          select: { id: true, userId: true, share: true, isOrganizer: true, user: { select: { firstName: true, lastName: true } } },
        },
      },
    });
    if (!r)                           throw new Error('RESERVATION_NOT_FOUND');
    if (r.resource.clubId !== clubId) throw new Error('CLUB_MISMATCH');
    const club = await prisma.club.findUniqueOrThrow({ where: { id: clubId }, select: { timezone: true, offPeakHours: true } });
    return this.mapReservation(r, club);
  }

  /**
   * (Ré)affecte le joueur principal d'une réservation — action admin au comptoir,
   * pour associer un joueur à l'encaissement. Le joueur doit être membre ACTIF du
   * club. La répartition par joueur se gère via add/removeReservationParticipant.
   * Pas de re-check quota (cohérent avec le bypass admin de adminCreateReservation).
   */
  async assignReservationMember(reservationId: string, clubId: string, memberUserId: string) {
    const reservation = await prisma.reservation.findUnique({
      where: { id: reservationId },
      include: { resource: { select: { clubId: true } } },
    });
    if (!reservation)                           throw new Error('RESERVATION_NOT_FOUND');
    if (reservation.resource.clubId !== clubId) throw new Error('CLUB_MISMATCH');

    const membership = await prisma.clubMembership.findUnique({
      where: { userId_clubId: { userId: memberUserId, clubId } },
    });
    if (!membership || membership.status === 'BLOCKED') throw new Error('MEMBER_NOT_FOUND');

    const updated = await prisma.reservation.update({ where: { id: reservationId }, data: { userId: memberUserId } });
    // Best-effort : prévenir le membre qu'il a été rattaché à la réservation.
    await this.safeNotify(() => notifyReservationMemberAssigned(reservationId, memberUserId));
    return updated;
  }

  /**
   * Cœur partagé d'ajout d'un participant : valide le membre + la capacité et
   * (re)répartit les parts (transaction Serializable). Suppose `reservation` chargée
   * avec resource.{clubId,attributes,price,offPeakPrice,club.{offPeakHours,timezone}}.
   */
  private async applyAddParticipant(
    reservation: {
      id: string; userId: string | null; type: ReservationType;
      totalPrice: Prisma.Decimal | null; startTime: Date; endTime: Date;
      resource: {
        clubId: string; attributes: Prisma.JsonValue; price: Prisma.Decimal; offPeakPrice: Prisma.Decimal | null;
        club: { offPeakHours: Prisma.JsonValue | null; timezone: string };
      };
    },
    memberUserId: string,
  ): Promise<void> {
    const membership = await prisma.clubMembership.findUnique({
      where: { userId_clubId: { userId: memberUserId, clubId: reservation.resource.clubId } },
    });
    if (!membership || membership.status === 'BLOCKED') throw new Error('MEMBER_NOT_FOUND');

    const format   = (reservation.resource.attributes as { format?: string } | null)?.format;
    const max      = playerCount(format);
    const dueCents = this.effectiveDueCents(reservation, reservation.resource.club);

    await prisma.$transaction(async (tx) => {
      const existing = await tx.reservationParticipant.findMany({
        where: { reservationId: reservation.id }, orderBy: { joinedAt: 'asc' },
        select: { id: true, userId: true, isOrganizer: true },
      });
      if (existing.some((p) => p.userId === memberUserId)) return; // déjà participant → no-op

      if (existing.length === 0) {
        if (!reservation.userId)                 throw new Error('RESERVATION_HAS_NO_MEMBER');
        if (reservation.userId === memberUserId) throw new Error('PARTNER_DUPLICATE');
        if (2 > max)                             throw new Error('TOO_MANY_PLAYERS');
        await tx.reservationParticipant.createMany({
          data: this.participantRows(reservation.id, reservation.userId, [memberUserId], dueCents),
        });
        return;
      }

      if (existing.length + 1 > max) throw new Error('TOO_MANY_PLAYERS');
      const organizer  = existing.find((p) => p.isOrganizer) ?? existing[0];
      const partnerIds = [...existing.filter((p) => p.id !== organizer.id).map((p) => p.userId), memberUserId];
      const shares     = this.splitShares(organizer.userId, partnerIds, dueCents);
      const byUser     = new Map(shares.map((s) => [s.userId, s]));
      for (const p of existing) {
        const s = byUser.get(p.userId)!;
        await tx.reservationParticipant.update({ where: { id: p.id }, data: { share: s.share, isOrganizer: s.isOrganizer } });
      }
      const ns = byUser.get(memberUserId)!;
      await tx.reservationParticipant.create({ data: { reservationId: reservation.id, userId: memberUserId, isOrganizer: ns.isOrganizer, share: ns.share } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  /**
   * Cœur partagé de retrait d'un participant : recalcule les parts des survivants.
   * Suppose `reservation` chargée avec resource.{price,offPeakPrice,club.{offPeakHours,timezone}}.
   */
  private async applyRemoveParticipant(
    reservation: {
      id: string; type: ReservationType; totalPrice: Prisma.Decimal | null; startTime: Date; endTime: Date;
      resource: { price: Prisma.Decimal; offPeakPrice: Prisma.Decimal | null; club: { offPeakHours: Prisma.JsonValue | null; timezone: string } };
    },
    participantId: string,
  ): Promise<void> {
    const dueCents = this.effectiveDueCents(reservation, reservation.resource.club);
    await prisma.$transaction(async (tx) => {
      const existing = await tx.reservationParticipant.findMany({
        where: { reservationId: reservation.id }, orderBy: { joinedAt: 'asc' },
        select: { id: true, userId: true, isOrganizer: true },
      });
      const target = existing.find((p) => p.id === participantId);
      if (!target)                                   throw new Error('PARTICIPANT_NOT_FOUND');
      if (target.isOrganizer && existing.length > 1) throw new Error('CANNOT_REMOVE_ORGANIZER');

      await tx.reservationParticipant.delete({ where: { id: participantId } });
      const remaining = existing.filter((p) => p.id !== participantId);
      if (remaining.length === 0) return;
      const organizer  = remaining.find((p) => p.isOrganizer) ?? remaining[0];
      const partnerIds = remaining.filter((p) => p.id !== organizer.id).map((p) => p.userId);
      const shares     = this.splitShares(organizer.userId, partnerIds, dueCents);
      const byUser     = new Map(shares.map((s) => [s.userId, s]));
      for (const p of remaining) {
        const s = byUser.get(p.userId)!;
        await tx.reservationParticipant.update({ where: { id: p.id }, data: { share: s.share, isOrganizer: s.isOrganizer } });
      }
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  /**
   * Ajoute un membre comme participant d'une réservation (répartition du paiement
   * par joueur, au comptoir). Membre ACTIF requis. Part recalculée (égale,
   * l'organisateur garde le reste). Si la résa n'a aucune ligne participant, la
   * première matérialise l'organisateur (membre principal) puis ajoute le membre.
   */
  async addReservationParticipant(reservationId: string, clubId: string, memberUserId: string) {
    const reservation = await prisma.reservation.findUnique({
      where: { id: reservationId },
      include: {
        resource: {
          select: { clubId: true, attributes: true, price: true, offPeakPrice: true, club: { select: { offPeakHours: true, timezone: true } } },
        },
      },
    });
    if (!reservation)                           throw new Error('RESERVATION_NOT_FOUND');
    if (reservation.resource.clubId !== clubId) throw new Error('CLUB_MISMATCH');

    await this.applyAddParticipant(reservation, memberUserId);

    // Best-effort : prévenir le membre qu'il a été ajouté à la partie.
    await this.safeNotify(() => notifyReservationMemberAssigned(reservationId, memberUserId));
    return this.loadClubReservation(reservationId, clubId);
  }

  /**
   * Retire un participant d'une réservation et recalcule les parts des survivants.
   * On ne peut pas retirer l'organisateur tant qu'il reste d'autres joueurs
   * (CANNOT_REMOVE_ORGANIZER). Les paiements déjà attribués au joueur retiré sont
   * conservés (participantId → null via onDelete: SetNull) : l'argent reste compté.
   */
  async removeReservationParticipant(reservationId: string, clubId: string, participantId: string) {
    const reservation = await prisma.reservation.findUnique({
      where: { id: reservationId },
      include: {
        resource: {
          select: { clubId: true, price: true, offPeakPrice: true, club: { select: { offPeakHours: true, timezone: true } } },
        },
      },
    });
    if (!reservation)                           throw new Error('RESERVATION_NOT_FOUND');
    if (reservation.resource.clubId !== clubId) throw new Error('CLUB_MISMATCH');

    await this.applyRemoveParticipant(reservation, participantId);
    return this.loadClubReservation(reservationId, clubId);
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

    const club = await prisma.club.findUniqueOrThrow({
      where: { id: params.clubId },
      select: { timezone: true, offPeakHours: true },
    });

    const reservations = await prisma.reservation.findMany({
      where,
      orderBy: { startTime: 'asc' },
      include: {
        resource: { select: { id: true, name: true, price: true, offPeakPrice: true } },
        user:     { select: { id: true, firstName: true, lastName: true, email: true } },
        payments: {
          select: { id: true, amount: true, method: true, payerName: true, note: true, createdAt: true, participantId: true },
          orderBy: { createdAt: 'asc' },
        },
        participants: {
          orderBy: { joinedAt: 'asc' },
          select: { id: true, userId: true, share: true, isOrganizer: true, user: { select: { firstName: true, lastName: true } } },
        },
      },
    });

    // Dû par résa = prix, sinon prix du créneau au tarif du terrain (COURT), sinon 0 —
    // exposé en `dueAmount` (cf. mapReservation) : le frontend ne recalcule plus.
    let totalC = 0, paidC = 0, outstandingC = 0;
    const withPaid = reservations.map((r) => {
      const enriched = this.mapReservation(r, club);
      if (r.status !== 'CANCELLED') {
        const dueC = Math.round(Number(enriched.dueAmount) * 100);
        const pC   = Math.round(Number(enriched.paidAmount) * 100);
        totalC += dueC;
        paidC  += pC;
        outstandingC += Math.max(0, dueC - pC); // clamp PAR résa : une surpayée ne masque pas le dû d'une autre
      }
      return enriched;
    });

    const euros = (c: number) => (c / 100).toFixed(2);
    return {
      reservations: withPaid,
      summary: {
        total:       euros(totalC),
        paid:        euros(paidC),
        paidTotal:   euros(paidC), // compat ascendante
        outstanding: euros(outstandingC),
      },
    };
  }

  /**
   * Encaissement manuel sur une réservation (vérifie le club).
   * Plafond : le total encaissé ne peut pas dépasser le prix de la résa —
   * ou, pour une résa COURT sans prix, le tarif du terrain (heures pleines/creuses).
   * VOUCHER : référence optionnelle, statut « à rembourser ».
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
    participantId?: string;
  }) {
    if (!(typeof params.amount === 'number') || isNaN(params.amount) || params.amount <= 0) {
      throw new Error('VALIDATION_ERROR');
    }
    const reservation = await prisma.reservation.findUnique({
      where: { id: params.reservationId },
      include: {
        resource: {
          select: {
            clubId: true, price: true, offPeakPrice: true,
            club: { select: { offPeakHours: true, timezone: true } },
          },
        },
      },
    });
    if (!reservation)                                  throw new Error('RESERVATION_NOT_FOUND');
    if (reservation.resource.clubId !== params.clubId) throw new Error('CLUB_MISMATCH');

    const methods = ['CASH', 'CARD', 'TRANSFER', 'ONLINE', 'OTHER', 'VOUCHER', 'PACK_CREDIT', 'WALLET', 'MEMBER'];
    const method = (methods.includes(params.method ?? '') ? params.method : 'CASH') as
      'CASH' | 'CARD' | 'TRANSFER' | 'ONLINE' | 'OTHER' | 'VOUCHER' | 'PACK_CREDIT' | 'WALLET' | 'MEMBER';

    const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

    // Paiement attribué à un joueur (participantId) : dû = sa part ; le solde prépayé
    // doit appartenir à CE joueur. Sinon (participantId absent) : paiement « résa » global.
    let participant: { id: string; userId: string } | null = null;
    let dueCents: number;
    if (params.participantId) {
      const p = await prisma.reservationParticipant.findUnique({
        where: { id: params.participantId },
        select: { id: true, reservationId: true, userId: true, share: true },
      });
      if (!p || p.reservationId !== params.reservationId) throw new Error('PARTICIPANT_NOT_FOUND');
      participant = { id: p.id, userId: p.userId };
      dueCents = Math.round(num(p.share) * 100);
    } else {
      // Montant dû en centimes : prix de la résa, sinon prix du créneau au tarif
      // du terrain (creux ssi entièrement en heures creuses) pour un créneau COURT.
      dueCents = Math.round(num(reservation.totalPrice) * 100);
      if (dueCents <= 0 && reservation.type === 'COURT') {
        dueCents = slotPriceCents(
          reservation.resource.club.offPeakHours as OffPeakHours | null,
          reservation.startTime, reservation.endTime, reservation.resource.club.timezone,
          Math.round(num(reservation.resource.price) * 100),
          reservation.resource.offPeakPrice != null ? Math.round(num(reservation.resource.offPeakPrice) * 100) : null,
        );
      }
    }
    const amountCents = Math.round(params.amount * 100);
    // Re-lit le total payé dans la transaction (Serializable) pour bloquer deux encaissements concurrents.
    // Scopé au participant si attribué, sinon à la résa entière.
    const overpaidWhere = participant ? { participantId: participant.id } : { reservationId: params.reservationId };
    const assertNotOverpaid = async (tx: Prisma.TransactionClient) => {
      if (dueCents <= 0) return;
      const agg = await tx.payment.aggregate({ _sum: { amount: true }, where: overpaidWhere });
      const paidCents = Math.round(num(agg._sum.amount) * 100);
      if (paidCents + amountCents > dueCents) throw new Error('PAYMENT_EXCEEDS_DUE');
    };

    const base = {
      reservationId: params.reservationId,
      participantId: params.participantId ?? null,
      clubId: params.clubId,
      amount: new Prisma.Decimal(params.amount),
      method,
      payerName: params.payerName?.trim() || null,
      note: params.note?.trim() || null,
      voucherRef:    method === 'VOUCHER' ? params.voucherRef?.trim() || null : null,
      voucherIssuer: method === 'VOUCHER' ? params.voucherIssuer?.trim() || null : null,
      voucherStatus: method === 'VOUCHER' ? ('PENDING_REIMBURSEMENT' as const) : null,
    };

    if (method !== 'PACK_CREDIT' && method !== 'WALLET') {
      return prisma.$transaction(async (tx) => {
        await assertNotOverpaid(tx);
        return tx.payment.create({ data: base });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    }

    // Paiement par solde prépayé : le package doit appartenir au joueur de la résa.
    if (!params.sourcePackageId) throw new Error('VALIDATION_ERROR');
    const pkg = await prisma.memberPackage.findUnique({ where: { id: params.sourcePackageId } });
    const expectedUserId = participant ? participant.userId : reservation.userId;
    if (!pkg || pkg.clubId !== params.clubId)                    throw new Error('PACKAGE_NOT_FOUND');
    if (expectedUserId && pkg.userId !== expectedUserId)         throw new Error('PACKAGE_NOT_FOUND');
    if ((method === 'PACK_CREDIT') !== (pkg.kind === 'ENTRIES')) throw new Error('VALIDATION_ERROR');

    return prisma.$transaction(async (tx) => {
      await assertNotOverpaid(tx);
      await PackageService.consume(tx, pkg, new Prisma.Decimal(params.amount));
      return tx.payment.create({ data: { ...base, sourcePackageId: pkg.id } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }
}
