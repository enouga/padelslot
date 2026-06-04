import { Prisma } from '@prisma/client';
import { prisma } from '../db/prisma';

export interface PlatformStats {
  clubs: { total: number; active: number; suspended: number };
  users: number;
  reservations: number;
  tournaments: number;
}

export class PlatformService {
  /** Statistiques globales de la plateforme. */
  async getStats(): Promise<PlatformStats> {
    const [total, active, suspended, users, reservations, tournaments] = await Promise.all([
      prisma.club.count(),
      prisma.club.count({ where: { status: 'ACTIVE' } }),
      prisma.club.count({ where: { status: 'SUSPENDED' } }),
      prisma.user.count(),
      prisma.reservation.count(),
      prisma.tournament.count(),
    ]);
    return { clubs: { total, active, suspended }, users, reservations, tournaments };
  }

  /** Tous les clubs (tous statuts), avec gérants OWNER et compteurs. */
  async listClubs() {
    const clubs = await prisma.club.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        members: {
          where: { role: 'OWNER' },
          include: { user: { select: { id: true, email: true, firstName: true, lastName: true } } },
        },
        _count: { select: { clubMemberships: true, resources: true } },
      },
    });
    return clubs.map((c) => ({
      id: c.id,
      slug: c.slug,
      name: c.name,
      city: c.city,
      status: c.status,
      createdAt: c.createdAt,
      owners: c.members.map((m) => m.user),
      counts: { adherents: c._count.clubMemberships, resources: c._count.resources },
    }));
  }

  /** Bascule le statut d'un club (ACTIVE/SUSPENDED). */
  async setClubStatus(id: string, status: 'ACTIVE' | 'SUSPENDED') {
    if (status !== 'ACTIVE' && status !== 'SUSPENDED') throw new Error('VALIDATION_ERROR');
    try {
      return await prisma.club.update({ where: { id }, data: { status } });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
        throw new Error('CLUB_NOT_FOUND');
      }
      throw err;
    }
  }
}
