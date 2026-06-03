import { Prisma, TournamentGender, TournamentStatus } from '@prisma/client';
import { prisma } from '../db/prisma';

type Sex = 'MALE' | 'FEMALE';

export interface CreateTournamentInput {
  clubSportId: string;
  name: string;
  category: string;
  gender: TournamentGender;
  description?: string | null;
  startTime: string | Date;
  endTime?: string | Date | null;
  registrationDeadline: string | Date;
  maxTeams?: number | null;
  entryFee?: number | null;
}
export type UpdateTournamentInput = Partial<CreateTournamentInput & { status: TournamentStatus }>;

/** Erreur métier avec, optionnellement, le joueur concerné ("self" | "partner"). */
function appError(code: string, subject?: 'self' | 'partner'): Error {
  return Object.assign(new Error(code), subject ? { subject } : {});
}

export class TournamentService {
  // ---------------------------------------------------------------- Inscription

  /** Inscrit un binôme (capitaine connecté + coéquipier par e-mail). */
  async register(tournamentId: string, captainUserId: string, partnerEmail: string) {
    const tournament = await prisma.tournament.findUnique({
      where: { id: tournamentId },
      select: { id: true, clubId: true, gender: true, status: true, registrationDeadline: true, maxTeams: true },
    });
    if (!tournament) throw new Error('TOURNAMENT_NOT_FOUND');
    if (tournament.status !== 'PUBLISHED') throw new Error('TOURNAMENT_NOT_OPEN');
    if (new Date() >= tournament.registrationDeadline) throw new Error('REGISTRATION_CLOSED');

    const { partnerUserId } = await this.resolveAndAssertEligible(tournament, captainUserId, partnerEmail);
    await this.assertNoActiveRegistration(tournamentId, [captainUserId, partnerUserId]);

    return prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM tournaments WHERE id = ${tournamentId} FOR UPDATE`;
      const confirmed = await tx.tournamentRegistration.count({ where: { tournamentId, status: 'CONFIRMED' } });
      const status = tournament.maxTeams == null || confirmed < tournament.maxTeams ? 'CONFIRMED' : 'WAITLISTED';
      return tx.tournamentRegistration.create({
        data: { tournamentId, captainUserId, partnerUserId, status },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 10_000 });
  }

  /** Change de coéquipier : conserve statut + place en liste d'attente (createdAt inchangé). */
  async changePartner(tournamentId: string, captainUserId: string, partnerEmail: string) {
    const tournament = await prisma.tournament.findUnique({
      where: { id: tournamentId },
      select: { id: true, clubId: true, gender: true, status: true, registrationDeadline: true },
    });
    if (!tournament) throw new Error('TOURNAMENT_NOT_FOUND');
    if (tournament.status === 'CANCELLED') throw new Error('TOURNAMENT_NOT_OPEN');
    if (new Date() >= tournament.registrationDeadline) throw new Error('REGISTRATION_LOCKED');

    const reg = await prisma.tournamentRegistration.findFirst({
      where: { tournamentId, captainUserId, status: { not: 'CANCELLED' } },
      select: { id: true },
    });
    if (!reg) throw new Error('REGISTRATION_NOT_FOUND');

    const { partnerUserId } = await this.resolveAndAssertEligible(tournament, captainUserId, partnerEmail);
    await this.assertNoActiveRegistration(tournamentId, [captainUserId, partnerUserId], reg.id);

    return prisma.tournamentRegistration.update({
      where: { id: reg.id },
      data: { partnerUserId },
    });
  }

  /** Le capitaine se désinscrit avant la deadline ; promotion auto du 1er en attente. */
  async cancelRegistration(tournamentId: string, captainUserId: string) {
    const tournament = await prisma.tournament.findUnique({
      where: { id: tournamentId },
      select: { registrationDeadline: true },
    });
    if (!tournament) throw new Error('TOURNAMENT_NOT_FOUND');
    if (new Date() >= tournament.registrationDeadline) throw new Error('REGISTRATION_LOCKED');

    const reg = await prisma.tournamentRegistration.findFirst({
      where: { tournamentId, captainUserId, status: { not: 'CANCELLED' } },
      select: { id: true, status: true },
    });
    if (!reg) throw new Error('REGISTRATION_NOT_FOUND');

    return this.cancelAndPromote(tournamentId, reg.id, reg.status === 'CONFIRMED');
  }

  /** Passe une inscription CANCELLED et, si elle était CONFIRMED, promeut le 1er WAITLISTED. */
  private async cancelAndPromote(tournamentId: string, regId: string, wasConfirmed: boolean) {
    return prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM tournaments WHERE id = ${tournamentId} FOR UPDATE`;
      const cancelled = await tx.tournamentRegistration.update({
        where: { id: regId },
        data: { status: 'CANCELLED', cancelledAt: new Date() },
      });
      if (wasConfirmed) {
        const next = await tx.tournamentRegistration.findFirst({
          where: { tournamentId, status: 'WAITLISTED' },
          orderBy: { createdAt: 'asc' },
          select: { id: true },
        });
        if (next) {
          await tx.tournamentRegistration.update({ where: { id: next.id }, data: { status: 'CONFIRMED' } });
        }
      }
      return cancelled;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 10_000 });
  }

  // ----------------------------------------------------------------- Helpers

  /** Vérifie l'éligibilité des 2 joueurs et renvoie l'id résolu du coéquipier. */
  private async resolveAndAssertEligible(
    tournament: { clubId: string; gender: TournamentGender },
    captainUserId: string,
    partnerEmail: string,
  ): Promise<{ partnerUserId: string }> {
    const email = (partnerEmail ?? '').trim().toLowerCase();
    if (!email) throw appError('PARTNER_NOT_FOUND', 'partner');

    const [captain, partner] = await Promise.all([
      prisma.user.findUnique({ where: { id: captainUserId }, select: { id: true, sex: true, phone: true } }),
      prisma.user.findUnique({ where: { email }, select: { id: true, sex: true, phone: true } }),
    ]);
    if (!captain) throw new Error('USER_NOT_FOUND');
    if (!partner) throw appError('PARTNER_NOT_FOUND', 'partner');
    if (partner.id === captain.id) throw new Error('PARTNER_IS_SELF');

    const [capM, partM] = await Promise.all([
      prisma.clubMembership.findUnique({ where: { userId_clubId: { userId: captain.id, clubId: tournament.clubId } }, select: { status: true, membershipNo: true } }),
      prisma.clubMembership.findUnique({ where: { userId_clubId: { userId: partner.id, clubId: tournament.clubId } }, select: { status: true, membershipNo: true } }),
    ]);

    if (capM?.status === 'BLOCKED') throw appError('MEMBERSHIP_BLOCKED', 'self');
    if (!capM) throw appError('MEMBERSHIP_REQUIRED', 'self');
    if (partM?.status === 'BLOCKED') throw appError('MEMBERSHIP_BLOCKED', 'partner');
    if (!partM) throw appError('MEMBERSHIP_REQUIRED', 'partner');

    if (!captain.phone) throw appError('PHONE_REQUIRED', 'self');
    if (!partner.phone) throw appError('PHONE_REQUIRED', 'partner');

    if (!capM.membershipNo) throw appError('LICENSE_REQUIRED', 'self');
    if (!partM.membershipNo) throw appError('LICENSE_REQUIRED', 'partner');

    if (!captain.sex) throw appError('SEX_REQUIRED', 'self');
    if (!partner.sex) throw appError('SEX_REQUIRED', 'partner');

    this.assertGender(tournament.gender, captain.sex as Sex, partner.sex as Sex);
    return { partnerUserId: partner.id };
  }

  private assertGender(gender: TournamentGender, a: Sex, b: Sex): void {
    const ok =
      gender === 'MEN'   ? a === 'MALE' && b === 'MALE' :
      gender === 'WOMEN' ? a === 'FEMALE' && b === 'FEMALE' :
      /* MIXED */          (a === 'MALE' && b === 'FEMALE') || (a === 'FEMALE' && b === 'MALE');
    if (!ok) throw new Error('GENDER_MISMATCH');
  }

  /** Aucun des userIds donnés ne doit déjà figurer dans un binôme actif du tournoi. */
  private async assertNoActiveRegistration(tournamentId: string, userIds: string[], excludeRegId?: string): Promise<void> {
    const dup = await prisma.tournamentRegistration.findFirst({
      where: {
        tournamentId,
        status: { not: 'CANCELLED' },
        ...(excludeRegId ? { id: { not: excludeRegId } } : {}),
        OR: [{ captainUserId: { in: userIds } }, { partnerUserId: { in: userIds } }],
      },
      select: { id: true },
    });
    if (dup) throw new Error('ALREADY_REGISTERED');
  }
}
