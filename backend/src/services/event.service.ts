import { ClubEventKind, ClubEventStatus, Prisma } from '@prisma/client';
import { prisma } from '../db/prisma';

export interface CreateEventInput {
  name: string;
  kind: ClubEventKind;
  description?: string | null;
  startTime: string | Date;
  endTime?: string | Date | null;
  registrationDeadline: string | Date;
  capacity?: number | null;
  price?: number | null;
  memberOnly?: boolean;
}
export type UpdateEventInput = Partial<CreateEventInput & { status: ClubEventStatus }>;

// utilisé en Task 5 (validation du CRUD admin)
const KINDS: ClubEventKind[] = ['MELEE', 'STAGE', 'SOIREE', 'INITIATION', 'AUTRE'];

export class EventService {
  // ---------------------------------------------------------------- Inscription

  /** Inscrit le joueur connecté (individuel). Réinscription après annulation = la ligne repart en fin de file. */
  async register(eventId: string, userId: string) {
    const event = await prisma.clubEvent.findUnique({
      where: { id: eventId },
      select: { id: true, clubId: true, status: true, registrationDeadline: true, capacity: true, memberOnly: true },
    });
    if (!event) throw new Error('EVENT_NOT_FOUND');
    if (event.status !== 'PUBLISHED') throw new Error('EVENT_NOT_OPEN');
    if (new Date() >= event.registrationDeadline) throw new Error('REGISTRATION_CLOSED');

    const membership = await prisma.clubMembership.findUnique({
      where: { userId_clubId: { userId, clubId: event.clubId } },
      select: { status: true },
    });
    if (membership?.status === 'BLOCKED') throw new Error('MEMBERSHIP_BLOCKED');
    if (event.memberOnly && membership?.status !== 'ACTIVE') throw new Error('MEMBERSHIP_REQUIRED');

    return prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM club_events WHERE id = ${eventId} FOR UPDATE`;
      const existing = await tx.eventRegistration.findUnique({
        where: { eventId_userId: { eventId, userId } },
        select: { id: true, status: true },
      });
      if (existing && existing.status !== 'CANCELLED') throw new Error('ALREADY_REGISTERED');

      const confirmed = await tx.eventRegistration.count({ where: { eventId, status: 'CONFIRMED' } });
      const status = event.capacity == null || confirmed < event.capacity ? 'CONFIRMED' : 'WAITLISTED';

      if (existing) {
        // Réinscription : la ligne CANCELLED est réutilisée, createdAt repart à
        // maintenant — le joueur ne récupère pas son ancienne position d'attente.
        return tx.eventRegistration.update({
          where: { id: existing.id },
          data: { status, cancelledAt: null, createdAt: new Date() },
        });
      }
      return tx.eventRegistration.create({ data: { eventId, userId, status } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 10_000 });
  }

  /** Le joueur se désinscrit avant la deadline ; promotion auto du 1er en attente. */
  async cancelRegistration(eventId: string, userId: string) {
    const event = await prisma.clubEvent.findUnique({
      where: { id: eventId },
      select: { registrationDeadline: true },
    });
    if (!event) throw new Error('EVENT_NOT_FOUND');
    if (new Date() >= event.registrationDeadline) throw new Error('REGISTRATION_LOCKED');

    return prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM club_events WHERE id = ${eventId} FOR UPDATE`;
      const reg = await tx.eventRegistration.findFirst({
        where: { eventId, userId, status: { not: 'CANCELLED' } },
        select: { id: true, status: true },
      });
      if (!reg) throw new Error('REGISTRATION_NOT_FOUND');
      return this.cancelAndPromoteTx(tx, eventId, reg.id, reg.status === 'CONFIRMED');
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 10_000 });
  }

  /** Passe une inscription CANCELLED et, si elle était CONFIRMED, promeut le 1er WAITLISTED. À appeler sous verrou de l'événement. */
  private async cancelAndPromoteTx(tx: Prisma.TransactionClient, eventId: string, regId: string, wasConfirmed: boolean) {
    const cancelled = await tx.eventRegistration.update({
      where: { id: regId },
      data: { status: 'CANCELLED', cancelledAt: new Date() },
    });
    if (wasConfirmed) {
      const next = await tx.eventRegistration.findFirst({
        where: { eventId, status: 'WAITLISTED' },
        orderBy: { createdAt: 'asc' },
        select: { id: true },
      });
      if (next) await tx.eventRegistration.update({ where: { id: next.id }, data: { status: 'CONFIRMED' } });
    }
    return cancelled;
  }

  // --------------------------------------------------------- Lectures publiques

  /** Animations PUBLISHED d'un club (par slug), triées par date, avec compteurs. */
  async listPublicByClubSlug(slug: string) {
    const club = await prisma.club.findUnique({ where: { slug }, select: { id: true, status: true } });
    if (!club || club.status !== 'ACTIVE') throw new Error('CLUB_NOT_FOUND');
    const events = await prisma.clubEvent.findMany({
      where: { clubId: club.id, status: 'PUBLISHED' },
      orderBy: { startTime: 'asc' },
    });
    return this.withCounts(events);
  }

  /** Détail public (DRAFT masqué) + compteurs + infos club. */
  async getById(eventId: string) {
    const e = await prisma.clubEvent.findUnique({
      where: { id: eventId },
      include: { club: { select: { slug: true, name: true, timezone: true } } },
    });
    if (!e || e.status === 'DRAFT') throw new Error('EVENT_NOT_FOUND');
    const [withCount] = await this.withCounts([e]);
    return withCount;
  }

  /** Inscriptions actives du joueur connecté, tous clubs, avec event + club. */
  async listUserRegistrations(userId: string) {
    return prisma.eventRegistration.findMany({
      where: { userId, status: { not: 'CANCELLED' } },
      orderBy: { event: { startTime: 'asc' } },
      include: { event: { include: { club: { select: { slug: true, name: true, timezone: true } } } } },
    });
  }

  /** Ajoute confirmedCount / waitlistCount à une liste d'événements. */
  private async withCounts<T extends { id: string }>(events: T[]) {
    if (events.length === 0) return [] as (T & { confirmedCount: number; waitlistCount: number })[];
    const grouped = await prisma.eventRegistration.groupBy({
      by: ['eventId', 'status'],
      where: { eventId: { in: events.map((e) => e.id) }, status: { not: 'CANCELLED' } },
      _count: { _all: true },
    });
    const count = (id: string, status: string) =>
      grouped.find((g) => g.eventId === id && g.status === status)?._count._all ?? 0;
    return events.map((e) => ({ ...e, confirmedCount: count(e.id, 'CONFIRMED'), waitlistCount: count(e.id, 'WAITLISTED') }));
  }
}
