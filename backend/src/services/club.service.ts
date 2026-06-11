import { Prisma } from '@prisma/client';
import bcrypt from 'bcrypt';
import { prisma } from '../db/prisma';
import { bySortOrder } from './resource.service';
import { OffPeakHours } from './pricing';

/** Valide/normalise les plages d'heures creuses (plusieurs par jour). null → efface (tout en pleines). */
function normalizeOffPeakHours(input: OffPeakHours | null | undefined): Prisma.InputJsonValue | typeof Prisma.DbNull {
  if (input === null || input === undefined) return Prisma.DbNull;
  if (typeof input !== 'object') throw new Error('VALIDATION_ERROR');
  const out: OffPeakHours = {};
  for (const [k, v] of Object.entries(input)) {
    const day = Number(k);
    if (!Number.isInteger(day) || day < 1 || day > 7 || !Array.isArray(v)) throw new Error('VALIDATION_ERROR');
    const ranges = v.map((r) => {
      const start = Number(r?.start), end = Number(r?.end);
      const startMin = r?.startMin != null ? Number(r.startMin) : 0;
      const endMin   = r?.endMin   != null ? Number(r.endMin)   : 0;
      const isIntInRange = (n: number, lo: number, hi: number) => Number.isInteger(n) && n >= lo && n <= hi;
      if (!isIntInRange(start, 0, 24) || !isIntInRange(end, 0, 24) ||
          !isIntInRange(startMin, 0, 59) || !isIntInRange(endMin, 0, 59)) throw new Error('VALIDATION_ERROR');
      const s = start * 60 + startMin, e = end * 60 + endMin;
      if (s < 0 || e > 24 * 60 || s >= e) throw new Error('VALIDATION_ERROR');
      return { start, startMin, end, endMin, s, e };
    }).sort((a, b) => a.s - b.s);
    // Les plages d'un même jour ne doivent pas se chevaucher.
    for (let i = 1; i < ranges.length; i++) {
      if (ranges[i].s < ranges[i - 1].e) throw new Error('VALIDATION_ERROR');
    }
    if (ranges.length) out[day] = ranges.map(({ start, startMin, end, endMin }) => ({ start, startMin, end, endMin }));
  }
  if (Object.keys(out).length === 0) return Prisma.DbNull;
  return out as unknown as Prisma.InputJsonValue;
}

/** Transforme un nom en slug URL (minuscules, tirets, sans accents). */
export function slugify(input: string): string {
  return input
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // enlève les accents
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

interface CreateClubParams {
  ownerId: string;
  name: string;
  slug?: string;
  address?: string;
  city?: string;
  timezone?: string;
}

export class ClubService {
  /** Crée un club et rattache l'auteur comme OWNER (transaction). */
  async createClub(params: CreateClubParams) {
    const name = (params.name ?? '').trim();
    if (!name) throw new Error('VALIDATION_ERROR');

    const slug = slugify(params.slug?.trim() || name);
    if (!slug) throw new Error('VALIDATION_ERROR');

    try {
      return await prisma.$transaction(async (tx) => {
        const club = await tx.club.create({
          data: {
            slug,
            name,
            address: params.address?.trim() || '',
            city: params.city?.trim() || null,
            timezone: params.timezone || 'Europe/Paris',
          },
        });
        await tx.clubMember.create({ data: { userId: params.ownerId, clubId: club.id, role: 'OWNER' } });
        return club;
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new Error('SLUG_TAKEN');
      }
      throw err;
    }
  }

  /** Annuaire public : clubs actifs, filtrable par sport (key), ville, texte. */
  async listClubs(filters: { sport?: string; city?: string; q?: string }) {
    const where: Prisma.ClubWhereInput = { status: 'ACTIVE', listedInDirectory: true };
    if (filters.city) where.city = { contains: filters.city, mode: 'insensitive' };
    if (filters.q)    where.name = { contains: filters.q, mode: 'insensitive' };
    if (filters.sport) where.clubSports = { some: { sport: { key: filters.sport } } };

    const clubs = await prisma.club.findMany({
      where,
      orderBy: { name: 'asc' },
      select: {
        id: true, slug: true, name: true, city: true, description: true, accentColor: true, logoUrl: true,
        clubSports: { select: { sport: { select: { key: true, name: true, icon: true } } } },
        _count: { select: { resources: true } },
      },
    });

    return clubs.map((c) => ({
      id: c.id, slug: c.slug, name: c.name, city: c.city, description: c.description,
      accentColor: c.accentColor, logoUrl: c.logoUrl,
      sports: c.clubSports.map((cs) => cs.sport),
      resourceCount: c._count.resources,
    }));
  }

  /** Détail public d'un club : sports activés + ressources actives. */
  async getClubBySlug(slug: string) {
    const club = await prisma.club.findUnique({
      where: { slug },
      select: {
        id: true, slug: true, name: true, address: true, city: true, country: true,
        description: true, timezone: true, logoUrl: true, accentColor: true, defaultThemeMode: true, status: true,
        publicBookingDays: true, memberBookingDays: true,
        clubSports: {
          select: {
            id: true, slotStepMin: true, durationsMin: true,
            sport: { select: { id: true, key: true, name: true, resourceNoun: true, defaultSlotStepMin: true, defaultDurationsMin: true, icon: true } },
            resources: {
              where: { isActive: true },
              orderBy: { name: 'asc' },
              select: { id: true, name: true, attributes: true, pricePerHour: true, openHour: true, closeHour: true },
            },
          },
        },
      },
    });
    if (!club || club.status !== 'ACTIVE') throw new Error('CLUB_NOT_FOUND');
    for (const cs of club.clubSports) cs.resources.sort(bySortOrder); // ordre manuel
    return club;
  }

  /** Détail d'un club pour le back-office (préremplissage des réglages). */
  async getClubForAdmin(clubId: string) {
    return prisma.club.findUniqueOrThrow({
      where: { id: clubId },
      select: {
        id: true, slug: true, name: true, description: true, address: true, city: true, country: true,
        timezone: true, logoUrl: true, accentColor: true, defaultThemeMode: true, status: true,
        listedInDirectory: true, publicBookingDays: true, memberBookingDays: true, offPeakHours: true,
      },
    });
  }

  /** Met à jour profil/branding/fenêtres d'un club (déjà scopé par requireClubMember). */
  async updateClub(clubId: string, params: {
    name?: string; description?: string; address?: string; city?: string;
    timezone?: string; logoUrl?: string; accentColor?: string; defaultThemeMode?: string;
    listedInDirectory?: boolean; publicBookingDays?: number; memberBookingDays?: number;
    offPeakHours?: OffPeakHours | null;
  }) {
    const clamp = (n: number) => Math.max(0, Math.min(365, Math.trunc(n)));
    return prisma.club.update({
      where: { id: clubId },
      data: {
        ...(params.offPeakHours !== undefined ? { offPeakHours: normalizeOffPeakHours(params.offPeakHours) } : {}),
        ...(params.name !== undefined ? { name: params.name.trim() } : {}),
        ...(params.description !== undefined ? { description: params.description } : {}),
        ...(params.address !== undefined ? { address: params.address } : {}),
        ...(params.city !== undefined ? { city: params.city } : {}),
        ...(params.timezone !== undefined ? { timezone: params.timezone } : {}),
        ...(params.logoUrl !== undefined ? { logoUrl: params.logoUrl } : {}),
        ...(params.accentColor !== undefined ? { accentColor: params.accentColor } : {}),
        ...(params.defaultThemeMode !== undefined ? { defaultThemeMode: params.defaultThemeMode } : {}),
        ...(typeof params.listedInDirectory === 'boolean' ? { listedInDirectory: params.listedInDirectory } : {}),
        ...(typeof params.publicBookingDays === 'number' ? { publicBookingDays: clamp(params.publicBookingDays) } : {}),
        ...(typeof params.memberBookingDays === 'number' ? { memberBookingDays: clamp(params.memberBookingDays) } : {}),
      },
    });
  }

  // --- Membres (fichier-membres du club ; être membre non bloqué = pouvoir réserver) ---

  async listMembers(clubId: string) {
    const members = await prisma.clubMembership.findMany({
      where: { clubId },
      orderBy: [{ user: { lastName: 'asc' } }, { user: { firstName: 'asc' } }],
      select: {
        id: true, isSubscriber: true, membershipNo: true, status: true, note: true, createdAt: true,
        user: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
      },
    });
    return members.map((m) => ({
      id: m.id, userId: m.user.id,
      firstName: m.user.firstName, lastName: m.user.lastName, email: m.user.email, phone: m.user.phone,
      isSubscriber: m.isSubscriber, membershipNo: m.membershipNo, status: m.status, note: m.note, since: m.createdAt,
    }));
  }

  /** Adhésion idempotente d'un user à un club (ACTIVE si absente ; garde le statut existant, BLOCKED inclus). */
  async ensureMembership(userId: string, clubId: string) {
    const existing = await prisma.clubMembership.findUnique({ where: { userId_clubId: { userId, clubId } } });
    if (existing) return existing;
    return prisma.clubMembership.create({ data: { userId, clubId } });
  }

  /** Ajoute un membre par email (le compte joueur doit déjà exister). */
  async addMemberByEmail(clubId: string, email: string) {
    const user = await prisma.user.findFirst({ where: { email: { equals: (email || '').trim(), mode: 'insensitive' } } });
    if (!user) throw new Error('USER_NOT_FOUND');
    await prisma.clubMembership.upsert({
      where: { userId_clubId: { userId: user.id, clubId } },
      update: { status: 'ACTIVE' },
      create: { userId: user.id, clubId },
    });
    return { ok: true };
  }

  /**
   * Crée un membre directement (compte + adhésion). Pas d'emailing : renvoie un
   * mot de passe temporaire à transmettre au joueur (durcir plus tard via invitation).
   */
  async createMember(clubId: string, params: { firstName: string; lastName: string; email: string; phone?: string; membershipNo?: string }) {
    const firstName = (params.firstName || '').trim();
    const lastName  = (params.lastName || '').trim();
    const email     = (params.email || '').trim();
    if (!firstName || !lastName || !email) throw new Error('VALIDATION_ERROR');
    const membershipNo = params.membershipNo?.trim() || null;

    const existing = await prisma.user.findFirst({ where: { email: { equals: email, mode: 'insensitive' } } });
    if (existing) {
      await prisma.clubMembership.upsert({
        where: { userId_clubId: { userId: existing.id, clubId } },
        update: { status: 'ACTIVE', membershipNo },
        create: { userId: existing.id, clubId, membershipNo },
      });
      return { tempPassword: null as string | null, existed: true };
    }

    const tempPassword = Math.random().toString(36).slice(2, 10);
    const hashed = await bcrypt.hash(tempPassword, 10);
    const user = await prisma.user.create({
      data: { email, password: hashed, firstName, lastName, phone: params.phone?.trim() || null },
    });
    await prisma.clubMembership.create({ data: { userId: user.id, clubId, membershipNo } });
    return { tempPassword, existed: false };
  }

  async updateMembership(
    clubId: string, membershipId: string,
    params: { isSubscriber?: boolean; membershipNo?: string | null; status?: 'ACTIVE' | 'BLOCKED'; note?: string | null; phone?: string | null },
  ) {
    const m = await prisma.clubMembership.findUnique({ where: { id: membershipId }, select: { clubId: true, userId: true } });
    if (!m || m.clubId !== clubId) throw new Error('MEMBER_NOT_FOUND');
    if (params.phone !== undefined) {
      await prisma.user.update({ where: { id: m.userId }, data: { phone: params.phone?.toString().trim() || null } });
    }
    return prisma.clubMembership.update({
      where: { id: membershipId },
      data: {
        ...(params.isSubscriber !== undefined ? { isSubscriber: params.isSubscriber } : {}),
        ...(params.membershipNo !== undefined ? { membershipNo: params.membershipNo?.toString().trim() || null } : {}),
        ...(params.status !== undefined ? { status: params.status } : {}),
        ...(params.note !== undefined ? { note: params.note?.toString().trim() || null } : {}),
      },
    });
  }

  async setMemberBlocked(clubId: string, membershipId: string, blocked: boolean) {
    const m = await prisma.clubMembership.findUnique({ where: { id: membershipId }, select: { clubId: true } });
    if (!m || m.clubId !== clubId) throw new Error('MEMBER_NOT_FOUND');
    return prisma.clubMembership.update({ where: { id: membershipId }, data: { status: blocked ? 'BLOCKED' : 'ACTIVE' } });
  }

  async removeMember(clubId: string, membershipId: string) {
    const m = await prisma.clubMembership.findUnique({ where: { id: membershipId }, select: { clubId: true } });
    if (!m || m.clubId !== clubId) throw new Error('MEMBER_NOT_FOUND');
    await prisma.clubMembership.delete({ where: { id: membershipId } });
  }

  /** Recherche de membres actifs par nom/prénom (pour choisir un coéquipier) ; requête vide = liste de parcours (≤20). Réservé aux membres actifs du club. */
  async searchMembers(slug: string, callerUserId: string, q: string) {
    const club = await prisma.club.findUnique({ where: { slug }, select: { id: true, status: true } });
    if (!club || club.status !== 'ACTIVE') throw new Error('CLUB_NOT_FOUND');
    const caller = await prisma.clubMembership.findUnique({
      where: { userId_clubId: { userId: callerUserId, clubId: club.id } },
      select: { status: true },
    });
    if (!caller || caller.status !== 'ACTIVE') throw new Error('MEMBERSHIP_REQUIRED');

    const query = (q ?? '').trim();
    const members = await prisma.clubMembership.findMany({
      where: {
        clubId: club.id,
        status: 'ACTIVE',
        userId: { not: callerUserId },
        ...(query
          ? { user: { OR: [{ firstName: { contains: query, mode: 'insensitive' } }, { lastName: { contains: query, mode: 'insensitive' } }] } }
          : {}),
      },
      orderBy: [{ user: { lastName: 'asc' } }, { user: { firstName: 'asc' } }],
      take: 20,
      select: { user: { select: { id: true, firstName: true, lastName: true } } },
    });
    return members.map((m) => m.user);
  }

  /** Adhésion du joueur connecté à ce club (licence / statut). */
  async getMyMembership(slug: string, userId: string) {
    const club = await prisma.club.findUnique({ where: { slug }, select: { id: true, status: true } });
    if (!club || club.status !== 'ACTIVE') throw new Error('CLUB_NOT_FOUND');
    const m = await prisma.clubMembership.findUnique({
      where: { userId_clubId: { userId, clubId: club.id } },
      select: { membershipNo: true, status: true, isSubscriber: true },
    });
    if (!m) throw new Error('MEMBERSHIP_REQUIRED');
    return m;
  }

  /** Le joueur renseigne / corrige sa propre licence (n° adhérent) pour ce club. */
  async setMyMembership(slug: string, userId: string, membershipNo: string) {
    const club = await prisma.club.findUnique({ where: { slug }, select: { id: true, status: true } });
    if (!club || club.status !== 'ACTIVE') throw new Error('CLUB_NOT_FOUND');
    const m = await prisma.clubMembership.findUnique({
      where: { userId_clubId: { userId, clubId: club.id } },
      select: { id: true, status: true },
    });
    if (!m) throw new Error('MEMBERSHIP_REQUIRED');
    if (m.status === 'BLOCKED') throw new Error('MEMBERSHIP_BLOCKED');
    const value = (membershipNo ?? '').trim();
    if (!value) throw new Error('VALIDATION_ERROR');
    return prisma.clubMembership.update({
      where: { id: m.id },
      data: { membershipNo: value },
      select: { membershipNo: true, status: true, isSubscriber: true },
    });
  }

  /** Sports activés par un club (avec leurs ressources, y compris inactives). */
  async listClubSports(clubId: string) {
    return prisma.clubSport.findMany({
      where: { clubId },
      select: {
        id: true, slotStepMin: true, durationsMin: true,
        sport: { select: { id: true, key: true, name: true, resourceNoun: true, defaultDurationsMin: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  /** Met à jour les durées proposées pour un sport du club (ex. padel: 1h30 par défaut). */
  async updateClubSport(clubSportId: string, clubId: string, durationsMin: number[]) {
    const cs = await prisma.clubSport.findUnique({ where: { id: clubSportId }, select: { clubId: true } });
    if (!cs || cs.clubId !== clubId) throw new Error('CLUB_SPORT_NOT_FOUND');

    const valid = Array.from(new Set(durationsMin))
      .filter((d) => Number.isInteger(d) && d >= 15 && d <= 240 && d % 15 === 0)
      .sort((a, b) => a - b);
    if (valid.length === 0) throw new Error('VALIDATION_ERROR');

    return prisma.clubSport.update({ where: { id: clubSportId }, data: { durationsMin: valid } });
  }

  /** Active un sport pour un club (idempotent). */
  async addClubSport(clubId: string, sportId: string) {
    const sport = await prisma.sport.findUnique({ where: { id: sportId } });
    if (!sport) throw new Error('SPORT_NOT_FOUND');
    return prisma.clubSport.upsert({
      where: { clubId_sportId: { clubId, sportId } },
      update: {},
      create: { clubId, sportId },
    });
  }
}
