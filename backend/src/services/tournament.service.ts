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

  /** Inscrit un binôme (capitaine connecté + coéquipier par identifiant). */
  async register(tournamentId: string, captainUserId: string, partnerUserId: string) {
    const tournament = await prisma.tournament.findUnique({
      where: { id: tournamentId },
      select: { id: true, clubId: true, gender: true, status: true, registrationDeadline: true, maxTeams: true },
    });
    if (!tournament) throw new Error('TOURNAMENT_NOT_FOUND');
    if (tournament.status !== 'PUBLISHED') throw new Error('TOURNAMENT_NOT_OPEN');
    if (new Date() >= tournament.registrationDeadline) throw new Error('REGISTRATION_CLOSED');

    await this.resolveAndAssertEligible(tournament, captainUserId, partnerUserId);

    return prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM tournaments WHERE id = ${tournamentId} FOR UPDATE`;
      await this.assertNoActiveRegistration(tx, tournamentId, [captainUserId, partnerUserId]);
      const confirmed = await tx.tournamentRegistration.count({ where: { tournamentId, status: 'CONFIRMED' } });
      const status = tournament.maxTeams == null || confirmed < tournament.maxTeams ? 'CONFIRMED' : 'WAITLISTED';
      return tx.tournamentRegistration.create({
        data: { tournamentId, captainUserId, partnerUserId, status },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 10_000 });
  }

  /** Change de coéquipier : conserve statut + place en liste d'attente (createdAt inchangé). */
  async changePartner(tournamentId: string, captainUserId: string, partnerUserId: string) {
    const tournament = await prisma.tournament.findUnique({
      where: { id: tournamentId },
      select: { id: true, clubId: true, gender: true, status: true, registrationDeadline: true },
    });
    if (!tournament) throw new Error('TOURNAMENT_NOT_FOUND');
    if (tournament.status !== 'PUBLISHED') throw new Error('TOURNAMENT_NOT_OPEN');
    if (new Date() >= tournament.registrationDeadline) throw new Error('REGISTRATION_LOCKED');

    await this.resolveAndAssertEligible(tournament, captainUserId, partnerUserId);

    return prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM tournaments WHERE id = ${tournamentId} FOR UPDATE`;
      const reg = await tx.tournamentRegistration.findFirst({
        where: { tournamentId, captainUserId, status: { not: 'CANCELLED' } },
        select: { id: true },
      });
      if (!reg) throw new Error('REGISTRATION_NOT_FOUND');
      await this.assertNoActiveRegistration(tx, tournamentId, [captainUserId, partnerUserId], reg.id);
      return tx.tournamentRegistration.update({ where: { id: reg.id }, data: { partnerUserId } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 10_000 });
  }

  /** Le capitaine se désinscrit avant la deadline ; promotion auto du 1er en attente. */
  async cancelRegistration(tournamentId: string, captainUserId: string) {
    const tournament = await prisma.tournament.findUnique({
      where: { id: tournamentId },
      select: { registrationDeadline: true },
    });
    if (!tournament) throw new Error('TOURNAMENT_NOT_FOUND');
    if (new Date() >= tournament.registrationDeadline) throw new Error('REGISTRATION_LOCKED');

    return prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM tournaments WHERE id = ${tournamentId} FOR UPDATE`;
      const reg = await tx.tournamentRegistration.findFirst({
        where: { tournamentId, captainUserId, status: { not: 'CANCELLED' } },
        select: { id: true, status: true },
      });
      if (!reg) throw new Error('REGISTRATION_NOT_FOUND');
      return this.cancelAndPromoteTx(tx, tournamentId, reg.id, reg.status === 'CONFIRMED');
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 10_000 });
  }

  /** Passe une inscription CANCELLED et, si elle était CONFIRMED, promeut le 1er WAITLISTED. À appeler dans une transaction qui détient déjà le verrou du tournoi. */
  private async cancelAndPromoteTx(tx: Prisma.TransactionClient, tournamentId: string, regId: string, wasConfirmed: boolean) {
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
  }

  // --------------------------------------------------------- Lectures publiques

  /** Tournois PUBLISHED à venir d'un club (par slug), avec compteurs de places. */
  async listPublicByClubSlug(slug: string) {
    const club = await prisma.club.findUnique({ where: { slug }, select: { id: true, status: true } });
    if (!club || club.status !== 'ACTIVE') throw new Error('CLUB_NOT_FOUND');
    const tournaments = await prisma.tournament.findMany({
      where: { clubId: club.id, status: 'PUBLISHED' },
      orderBy: { startTime: 'asc' },
    });
    return this.withCounts(tournaments);
  }

  /** Détail public d'un tournoi (DRAFT masqué) + compteurs. */
  async getById(tournamentId: string) {
    const t = await prisma.tournament.findUnique({
      where: { id: tournamentId },
      include: { club: { select: { slug: true, name: true, timezone: true } }, clubSport: { select: { sport: { select: { key: true, name: true } } } } },
    });
    if (!t || t.status === 'DRAFT') throw new Error('TOURNAMENT_NOT_FOUND');
    const [withCount] = await this.withCounts([t]);
    return withCount;
  }

  /** Liste publique des binômes inscrits (noms + avatar), confirmés puis liste d'attente. DRAFT masqué. */
  async listParticipants(tournamentId: string) {
    const t = await prisma.tournament.findUnique({ where: { id: tournamentId }, select: { status: true } });
    if (!t || t.status === 'DRAFT') throw new Error('TOURNAMENT_NOT_FOUND');
    return prisma.tournamentRegistration.findMany({
      where: { tournamentId, status: { not: 'CANCELLED' } },
      orderBy: [{ status: 'asc' }, { createdAt: 'asc' }], // CONFIRMED avant WAITLISTED, puis ordre d'inscription
      select: {
        id: true,
        status: true,
        captain: { select: { firstName: true, lastName: true, avatarUrl: true } },
        partner: { select: { firstName: true, lastName: true, avatarUrl: true } },
      },
    });
  }

  /** Inscriptions actives du joueur connecté (capitaine OU partenaire), tous clubs, avec tél + licence du binôme. */
  async listUserRegistrations(userId: string) {
    const regs = await prisma.tournamentRegistration.findMany({
      where: { status: { not: 'CANCELLED' }, OR: [{ captainUserId: userId }, { partnerUserId: userId }] },
      orderBy: { tournament: { startTime: 'asc' } },
      include: {
        tournament: { include: { club: { select: { slug: true, name: true, timezone: true } } } },
        captain: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
        partner: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
      },
    });

    // Licence (membershipNo) de chaque joueur dans le club du tournoi concerné.
    const wanted = new Map<string, { userId: string; clubId: string }>();
    for (const r of regs) {
      wanted.set(`${r.captainUserId}:${r.tournament.clubId}`, { userId: r.captainUserId, clubId: r.tournament.clubId });
      wanted.set(`${r.partnerUserId}:${r.tournament.clubId}`, { userId: r.partnerUserId, clubId: r.tournament.clubId });
    }
    const memberships = wanted.size
      ? await prisma.clubMembership.findMany({
          where: { OR: [...wanted.values()].map((k) => ({ userId: k.userId, clubId: k.clubId })) },
          select: { userId: true, clubId: true, membershipNo: true },
        })
      : [];
    const licByKey = new Map(memberships.map((m) => [`${m.userId}:${m.clubId}`, m.membershipNo]));

    return regs.map((r) => ({
      ...r,
      captain: { ...r.captain, phone: r.captainUserId === userId ? r.captain.phone : null },
      partner: { ...r.partner, phone: r.partnerUserId === userId ? r.partner.phone : null },
      captainLicense: licByKey.get(`${r.captainUserId}:${r.tournament.clubId}`) ?? null,
      partnerLicense: licByKey.get(`${r.partnerUserId}:${r.tournament.clubId}`) ?? null,
    }));
  }

  /** Ajoute confirmedCount / waitlistCount à une liste de tournois. */
  private async withCounts<T extends { id: string }>(tournaments: T[]) {
    if (tournaments.length === 0) return [] as (T & { confirmedCount: number; waitlistCount: number })[];
    const grouped = await prisma.tournamentRegistration.groupBy({
      by: ['tournamentId', 'status'],
      where: { tournamentId: { in: tournaments.map((t) => t.id) }, status: { not: 'CANCELLED' } },
      _count: { _all: true },
    });
    const count = (id: string, status: string) =>
      grouped.find((g) => g.tournamentId === id && g.status === status)?._count._all ?? 0;
    return tournaments.map((t) => ({ ...t, confirmedCount: count(t.id, 'CONFIRMED'), waitlistCount: count(t.id, 'WAITLISTED') }));
  }

  // ----------------------------------------------------------- Admin (club)

  /** Tous les tournois du club (DRAFT inclus) + compteurs. */
  async listForAdmin(clubId: string) {
    const tournaments = await prisma.tournament.findMany({ where: { clubId }, orderBy: { startTime: 'desc' } });
    return this.withCounts(tournaments);
  }

  /** Détail admin : tournoi + inscriptions actives avec coordonnées (nom/tél/sexe/licence). */
  async getForAdmin(tournamentId: string, clubId: string) {
    const t = await prisma.tournament.findFirst({ where: { id: tournamentId, clubId } });
    if (!t) throw new Error('TOURNAMENT_NOT_FOUND');
    const registrations = await prisma.tournamentRegistration.findMany({
      where: { tournamentId, status: { not: 'CANCELLED' } },
      orderBy: [{ status: 'asc' }, { createdAt: 'asc' }],
      include: {
        captain: { select: { id: true, firstName: true, lastName: true, email: true, phone: true, sex: true } },
        partner: { select: { id: true, firstName: true, lastName: true, email: true, phone: true, sex: true } },
      },
    });
    const userIds = [...new Set(registrations.flatMap((r) => [r.captainUserId, r.partnerUserId]))];
    const memberships = userIds.length
      ? await prisma.clubMembership.findMany({ where: { clubId, userId: { in: userIds } }, select: { userId: true, membershipNo: true } })
      : [];
    const licenseByUser = new Map(memberships.map((m) => [m.userId, m.membershipNo]));
    return {
      tournament: t,
      registrations: registrations.map((r) => ({
        ...r,
        captainLicense: licenseByUser.get(r.captainUserId) ?? null,
        partnerLicense: licenseByUser.get(r.partnerUserId) ?? null,
      })),
    };
  }

  async createTournament(clubId: string, input: CreateTournamentInput) {
    const data = this.validateTournamentInput(input, true);
    const cs = await prisma.clubSport.findFirst({ where: { id: input.clubSportId, clubId }, select: { id: true } });
    if (!cs) throw new Error('CLUB_SPORT_NOT_FOUND');
    return prisma.tournament.create({ data: { clubId, clubSportId: input.clubSportId, ...data } as Prisma.TournamentUncheckedCreateInput });
  }

  async updateTournament(tournamentId: string, clubId: string, input: UpdateTournamentInput) {
    const found = await prisma.tournament.findFirst({ where: { id: tournamentId, clubId }, select: { id: true } });
    if (!found) throw new Error('TOURNAMENT_NOT_FOUND');
    const data = this.validateTournamentInput(input, false);
    if (input.status !== undefined) {
      if (!['DRAFT', 'PUBLISHED', 'CANCELLED'].includes(input.status as string)) throw new Error('VALIDATION_ERROR');
      (data as Record<string, unknown>).status = input.status;
    }
    return prisma.tournament.update({ where: { id: tournamentId }, data });
  }

  async deleteTournament(tournamentId: string, clubId: string) {
    const found = await prisma.tournament.findFirst({ where: { id: tournamentId, clubId }, select: { id: true } });
    if (!found) throw new Error('TOURNAMENT_NOT_FOUND');
    const active = await prisma.tournamentRegistration.count({ where: { tournamentId, status: { not: 'CANCELLED' } } });
    if (active > 0) throw new Error('HAS_REGISTRATIONS'); // utiliser status=CANCELLED pour annuler à la place
    await prisma.tournament.delete({ where: { id: tournamentId } });
  }

  /** Promotion manuelle d'un binôme en attente par le club (override, sans contrôle de place). */
  async adminPromoteRegistration(tournamentId: string, regId: string, clubId: string) {
    const reg = await this.findClubRegistration(tournamentId, regId, clubId);
    if (reg.status !== 'WAITLISTED') throw new Error('VALIDATION_ERROR');
    return prisma.tournamentRegistration.update({ where: { id: regId }, data: { status: 'CONFIRMED' } });
  }

  /** Désinscription manuelle par le club (promeut le 1er en attente si c'était un CONFIRMED). */
  async adminRemoveRegistration(tournamentId: string, regId: string, clubId: string) {
    await this.findClubRegistration(tournamentId, regId, clubId); // vérifie l'appartenance au club
    return prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM tournaments WHERE id = ${tournamentId} FOR UPDATE`;
      const reg = await tx.tournamentRegistration.findFirst({
        where: { id: regId, status: { not: 'CANCELLED' } },
        select: { id: true, status: true },
      });
      if (!reg) throw new Error('REGISTRATION_NOT_FOUND');
      return this.cancelAndPromoteTx(tx, tournamentId, regId, reg.status === 'CONFIRMED');
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 10_000 });
  }

  private async findClubRegistration(tournamentId: string, regId: string, clubId: string) {
    const reg = await prisma.tournamentRegistration.findFirst({
      where: { id: regId, tournamentId, tournament: { clubId } },
      select: { id: true, status: true },
    });
    if (!reg) throw new Error('REGISTRATION_NOT_FOUND');
    return reg;
  }

  /** Valide + normalise les champs d'un tournoi. `requireAll` pour la création. */
  private validateTournamentInput(input: UpdateTournamentInput, requireAll: boolean) {
    const data: Record<string, unknown> = {};
    const setStr = (key: 'name' | 'category', value?: string) => {
      const v = (value ?? '').trim();
      if (requireAll && !v) throw new Error('VALIDATION_ERROR');
      if (value !== undefined) { if (!v) throw new Error('VALIDATION_ERROR'); data[key] = v; }
    };
    setStr('name', input.name);
    setStr('category', input.category);

    if (requireAll || input.gender !== undefined) {
      if (!['MEN', 'WOMEN', 'MIXED'].includes(input.gender as string)) throw new Error('VALIDATION_ERROR');
      data.gender = input.gender;
    }
    if (input.description !== undefined) data.description = (input.description ?? '')?.toString().trim() || null;

    const parseDate = (v: string | Date) => { const d = new Date(v); if (isNaN(d.getTime())) throw new Error('VALIDATION_ERROR'); return d; };
    if (requireAll || input.startTime !== undefined) data.startTime = parseDate(input.startTime as string | Date);
    if (requireAll || input.registrationDeadline !== undefined) data.registrationDeadline = parseDate(input.registrationDeadline as string | Date);
    if (input.endTime !== undefined) data.endTime = input.endTime ? parseDate(input.endTime) : null;

    if (input.maxTeams !== undefined) {
      if (input.maxTeams === null) data.maxTeams = null;
      else { const n = Math.trunc(Number(input.maxTeams)); if (isNaN(n) || n < 1) throw new Error('VALIDATION_ERROR'); data.maxTeams = n; }
    }
    if (input.entryFee !== undefined) {
      if (input.entryFee === null) data.entryFee = null;
      else { const f = Number(input.entryFee); if (isNaN(f) || f < 0) throw new Error('VALIDATION_ERROR'); data.entryFee = new Prisma.Decimal(f); }
    }
    return data;
  }

  // ----------------------------------------------------------------- Helpers

  /** Vérifie l'éligibilité du capitaine et du coéquipier (résolus par id). */
  private async resolveAndAssertEligible(
    tournament: { clubId: string; gender: TournamentGender },
    captainUserId: string,
    partnerUserId: string,
  ): Promise<void> {
    if (!partnerUserId) throw appError('PARTNER_NOT_FOUND', 'partner');
    if (partnerUserId === captainUserId) throw new Error('PARTNER_IS_SELF');

    const [captain, partner] = await Promise.all([
      prisma.user.findUnique({ where: { id: captainUserId }, select: { id: true, sex: true, phone: true } }),
      prisma.user.findUnique({ where: { id: partnerUserId }, select: { id: true, sex: true, phone: true } }),
    ]);
    if (!captain) throw new Error('USER_NOT_FOUND');
    if (!partner) throw appError('PARTNER_NOT_FOUND', 'partner');

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
  }

  private assertGender(gender: TournamentGender, a: Sex, b: Sex): void {
    const ok =
      gender === 'MEN'   ? a === 'MALE' && b === 'MALE' :
      gender === 'WOMEN' ? a === 'FEMALE' && b === 'FEMALE' :
      /* MIXED */          (a === 'MALE' && b === 'FEMALE') || (a === 'FEMALE' && b === 'MALE');
    if (!ok) throw new Error('GENDER_MISMATCH');
  }

  /** Aucun des userIds donnés ne doit déjà figurer dans un binôme actif du tournoi. */
  private async assertNoActiveRegistration(client: Prisma.TransactionClient, tournamentId: string, userIds: string[], excludeRegId?: string): Promise<void> {
    const dup = await client.tournamentRegistration.findFirst({
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
