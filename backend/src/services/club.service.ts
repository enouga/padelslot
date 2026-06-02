import { Prisma } from '@prisma/client';
import { prisma } from '../db/prisma';

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
    return club;
  }

  /** Détail d'un club pour le back-office (préremplissage des réglages). */
  async getClubForAdmin(clubId: string) {
    return prisma.club.findUniqueOrThrow({
      where: { id: clubId },
      select: {
        id: true, slug: true, name: true, description: true, address: true, city: true, country: true,
        timezone: true, logoUrl: true, accentColor: true, defaultThemeMode: true, status: true,
        listedInDirectory: true, publicBookingDays: true, memberBookingDays: true,
      },
    });
  }

  /** Met à jour profil/branding/fenêtres d'un club (déjà scopé par requireClubMember). */
  async updateClub(clubId: string, params: {
    name?: string; description?: string; address?: string; city?: string;
    timezone?: string; logoUrl?: string; accentColor?: string; defaultThemeMode?: string;
    listedInDirectory?: boolean; publicBookingDays?: number; memberBookingDays?: number;
  }) {
    const clamp = (n: number) => Math.max(0, Math.min(365, Math.trunc(n)));
    return prisma.club.update({
      where: { id: clubId },
      data: {
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

  // --- Abonnés (joueurs avec accès anticipé) ---

  async listSubscribers(clubId: string) {
    const subs = await prisma.clubSubscriber.findMany({
      where: { clubId },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true, user: { select: { id: true, firstName: true, lastName: true, email: true } } },
    });
    return subs.map((s) => ({ ...s.user, since: s.createdAt }));
  }

  /** Ajoute un abonné par email (le compte joueur doit déjà exister). */
  async addSubscriberByEmail(clubId: string, email: string) {
    const user = await prisma.user.findFirst({ where: { email: { equals: (email || '').trim(), mode: 'insensitive' } } });
    if (!user) throw new Error('USER_NOT_FOUND');
    await prisma.clubSubscriber.upsert({
      where: { userId_clubId: { userId: user.id, clubId } },
      update: {},
      create: { userId: user.id, clubId },
    });
    return { id: user.id, firstName: user.firstName, lastName: user.lastName, email: user.email };
  }

  async removeSubscriber(clubId: string, userId: string) {
    await prisma.clubSubscriber.deleteMany({ where: { clubId, userId } });
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
