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

  /** Détail public d'un club : sports activés + ressources actives. */
  async getClubBySlug(slug: string) {
    const club = await prisma.club.findUnique({
      where: { slug },
      select: {
        id: true, slug: true, name: true, address: true, city: true, country: true,
        description: true, timezone: true, logoUrl: true, accentColor: true, defaultThemeMode: true, status: true,
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

  /** Met à jour profil/branding d'un club (déjà scopé par requireClubMember). */
  async updateClub(clubId: string, params: {
    name?: string; description?: string; address?: string; city?: string;
    timezone?: string; logoUrl?: string; accentColor?: string; defaultThemeMode?: string;
  }) {
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
      },
    });
  }

  /** Sports activés par un club (avec leurs ressources, y compris inactives). */
  async listClubSports(clubId: string) {
    return prisma.clubSport.findMany({
      where: { clubId },
      select: {
        id: true, slotStepMin: true, durationsMin: true,
        sport: { select: { id: true, key: true, name: true, resourceNoun: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
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
