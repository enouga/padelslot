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
}
