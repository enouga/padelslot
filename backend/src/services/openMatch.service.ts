import { Prisma } from '@prisma/client';
import { prisma } from '../db/prisma';
import { playerCount } from '../utils/courtType';
import { notifyOpenMatchJoin, notifyOpenMatchLeft, notifyOpenMatchRemoved } from '../email/notifications';

// « Parties ouvertes » : les réservations PUBLIC qu'un membre du club peut découvrir
// et rejoindre jusqu'à complet. Repose sur les participants (ReservationParticipant).
export class OpenMatchService {
  /** Résout un club ACTIVE par slug et vérifie que l'appelant en est membre ACTIVE. */
  private async resolveActiveMember(slug: string, userId: string): Promise<{ id: string }> {
    const club = await prisma.club.findUnique({ where: { slug }, select: { id: true, status: true } });
    if (!club || club.status !== 'ACTIVE') throw new Error('CLUB_NOT_FOUND');
    const member = await prisma.clubMembership.findUnique({
      where: { userId_clubId: { userId, clubId: club.id } },
      select: { status: true },
    });
    if (!member) throw new Error('MEMBERSHIP_REQUIRED');
    if (member.status === 'BLOCKED') throw new Error('MEMBERSHIP_BLOCKED');
    return { id: club.id };
  }

  /** Met à jour les parts de tous les participants : organisateur = reste au centime, autres = part égale. */
  private async applyShares(
    tx: Prisma.TransactionClient,
    parts: Array<{ id: string; isOrganizer: boolean }>,
    priceCents: number,
  ): Promise<void> {
    const n = parts.length;
    if (n === 0) return;
    const baseCents = Math.floor(priceCents / n);
    const organizerCents = priceCents - baseCents * (n - 1);
    for (const p of parts) {
      await tx.reservationParticipant.update({
        where: { id: p.id },
        data: { share: new Prisma.Decimal(p.isOrganizer ? organizerCents : baseCents).div(100) },
      });
    }
  }

  /** Envoi d'email best-effort : un échec est avalé, jamais propagé (ne casse pas le join). */
  private async safeNotify(fn: () => Promise<void>): Promise<void> {
    try { await fn(); }
    catch (err) { console.error('[openMatch] notification échouée', err); }
  }

  /** Parties ouvertes à venir d'un club, pour un membre (places restantes incluses). */
  async listOpenMatches(slug: string, viewerUserId: string) {
    const club = await this.resolveActiveMember(slug, viewerUserId);
    const matches = await prisma.reservation.findMany({
      where: {
        visibility: 'PUBLIC',
        status: 'CONFIRMED',
        startTime: { gt: new Date() },
        resource: { clubId: club.id },
      },
      orderBy: { startTime: 'asc' },
      include: {
        resource: { select: { id: true, name: true, attributes: true } },
        participants: {
          orderBy: { joinedAt: 'asc' },
          select: { userId: true, isOrganizer: true, user: { select: { firstName: true, lastName: true, avatarUrl: true } } },
        },
      },
    });

    return matches.map((m) => {
      const maxPlayers = playerCount((m.resource.attributes as { format?: string } | null)?.format);
      return {
        id: m.id,
        resourceName: m.resource.name,
        startTime: m.startTime.toISOString(),
        endTime: m.endTime.toISOString(),
        maxPlayers,
        spotsLeft: Math.max(0, maxPlayers - m.participants.length),
        full: m.participants.length >= maxPlayers,
        viewerIsParticipant: m.participants.some((p) => p.userId === viewerUserId),
        viewerIsOrganizer: m.participants.some((p) => p.userId === viewerUserId && p.isOrganizer),
        players: m.participants.map((p) => ({
          userId: p.userId, firstName: p.user.firstName, lastName: p.user.lastName, avatarUrl: p.user.avatarUrl, isOrganizer: p.isOrganizer,
        })),
      };
    });
  }

  /** Rejoindre une partie ouverte : transaction Serializable + FOR UPDATE (anti sur-réservation). */
  async joinOpenMatch(slug: string, reservationId: string, userId: string) {
    const club = await this.resolveActiveMember(slug, userId);

    const result = await prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<Array<{ status: string; visibility: string; start_time: Date; resource_id: string; total_price: string }>>`
        SELECT status, visibility, start_time, resource_id, total_price FROM reservations WHERE id = ${reservationId} FOR UPDATE
      `;
      const r = locked[0];
      if (!r) throw new Error('RESERVATION_NOT_FOUND');

      const resource = await tx.resource.findUnique({ where: { id: r.resource_id }, select: { clubId: true, attributes: true } });
      if (!resource || resource.clubId !== club.id) throw new Error('CLUB_MISMATCH');
      if (r.visibility !== 'PUBLIC' || r.status !== 'CONFIRMED') throw new Error('MATCH_NOT_JOINABLE');
      if (new Date(r.start_time).getTime() <= Date.now()) throw new Error('MATCH_IN_PAST');

      const maxPlayers = playerCount((resource.attributes as { format?: string } | null)?.format);
      const parts = await tx.reservationParticipant.findMany({
        where: { reservationId },
        select: { id: true, userId: true, isOrganizer: true },
      });
      if (parts.length >= maxPlayers) throw new Error('MATCH_FULL');
      if (parts.some((p) => p.userId === userId)) throw new Error('ALREADY_JOINED');

      const created = await tx.reservationParticipant.create({
        data: { reservationId, userId, isOrganizer: false, share: new Prisma.Decimal(0) },
      });
      const priceCents = Math.round(Number(r.total_price) * 100);
      await this.applyShares(tx, [...parts.map((p) => ({ id: p.id, isOrganizer: p.isOrganizer })), { id: created.id, isOrganizer: false }], priceCents);
      return { id: reservationId };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 10_000 });

    // Après commit, best-effort : prévenir l'organisateur qu'un joueur a rejoint.
    await this.safeNotify(() => notifyOpenMatchJoin(reservationId, userId));
    return result;
  }

  /**
   * Retrait d'un joueur d'une partie ouverte.
   * - target == acteur : départ volontaire (« Quitter »).
   * - target ≠ acteur : seul l'organisateur peut retirer un autre joueur (NOT_ORGANIZER sinon).
   * On ne retire jamais l'organisateur (il annule la résa pour dissoudre la partie).
   */
  async removeOpenMatchPlayer(slug: string, reservationId: string, actorUserId: string, targetUserId: string) {
    const club = await this.resolveActiveMember(slug, actorUserId);

    const outcome = await prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<Array<{ start_time: Date; resource_id: string; total_price: string }>>`
        SELECT start_time, resource_id, total_price FROM reservations WHERE id = ${reservationId} FOR UPDATE
      `;
      const r = locked[0];
      if (!r) throw new Error('RESERVATION_NOT_FOUND');
      const resource = await tx.resource.findUnique({ where: { id: r.resource_id }, select: { clubId: true } });
      if (!resource || resource.clubId !== club.id) throw new Error('CLUB_MISMATCH');
      if (new Date(r.start_time).getTime() <= Date.now()) throw new Error('MATCH_IN_PAST');

      const parts = await tx.reservationParticipant.findMany({
        where: { reservationId },
        select: { id: true, userId: true, isOrganizer: true },
      });
      const actor = parts.find((p) => p.userId === actorUserId);
      if (!actor) throw new Error('PARTICIPANT_NOT_FOUND');
      const isSelf = actorUserId === targetUserId;
      if (!isSelf && !actor.isOrganizer) throw new Error('NOT_ORGANIZER');

      const target = parts.find((p) => p.userId === targetUserId);
      if (!target) throw new Error('PARTICIPANT_NOT_FOUND');
      if (target.isOrganizer) throw new Error(isSelf ? 'ORGANIZER_CANNOT_LEAVE' : 'CANNOT_REMOVE_ORGANIZER');

      await tx.reservationParticipant.delete({ where: { id: target.id } });
      const remaining = parts.filter((p) => p.id !== target.id).map((p) => ({ id: p.id, isOrganizer: p.isOrganizer }));
      await this.applyShares(tx, remaining, Math.round(Number(r.total_price) * 100));
      return { isSelf };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 10_000 });

    // Best-effort après commit : prévenir la bonne personne.
    if (outcome.isSelf) await this.safeNotify(() => notifyOpenMatchLeft(reservationId, targetUserId));
    else                await this.safeNotify(() => notifyOpenMatchRemoved(reservationId, targetUserId));
    return { id: reservationId };
  }

  /** Quitter une partie ouverte (départ volontaire) — délègue au retrait unifié. */
  async leaveOpenMatch(slug: string, reservationId: string, userId: string) {
    return this.removeOpenMatchPlayer(slug, reservationId, userId, userId);
  }
}
