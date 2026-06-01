import { Prisma } from '@prisma/client';
import { prisma } from '../db/prisma';

interface CreateResourceParams {
  clubId: string;
  clubSportId: string;
  name: string;
  attributes?: Prisma.InputJsonValue;
  pricePerHour: number;
  openHour?: number;
  closeHour?: number;
}

interface UpdateResourceParams {
  name?: string;
  attributes?: Prisma.InputJsonValue;
  pricePerHour?: number;
  openHour?: number;
  closeHour?: number;
}

/** Valide les horaires/tarif. Lève VALIDATION_ERROR si invalide. */
function validateHoursAndPrice(open: number, close: number, price: number): void {
  if (!Number.isInteger(open) || !Number.isInteger(close) || open < 0 || close > 24 || open >= close) {
    throw new Error('VALIDATION_ERROR');
  }
  if (typeof price !== 'number' || isNaN(price) || price <= 0) {
    throw new Error('VALIDATION_ERROR');
  }
}

export class ResourceService {
  /** Liste toutes les ressources d'un club (y compris désactivées). */
  async listClubResources(clubId: string) {
    return prisma.resource.findMany({
      where: { clubId },
      orderBy: { name: 'asc' },
      select: {
        id: true, name: true, attributes: true, isActive: true,
        pricePerHour: true, openHour: true, closeHour: true,
        clubSport: { select: { id: true, sport: { select: { key: true, name: true, resourceNoun: true } } } },
      },
    });
  }

  /** Vérifie qu'un clubSport appartient bien au club. */
  private async assertClubSport(clubSportId: string, clubId: string) {
    const cs = await prisma.clubSport.findUnique({ where: { id: clubSportId }, select: { clubId: true } });
    if (!cs || cs.clubId !== clubId) throw new Error('CLUB_SPORT_NOT_FOUND');
  }

  async createResource(params: CreateResourceParams) {
    const name = (params.name ?? '').trim();
    if (!name) throw new Error('VALIDATION_ERROR');

    await this.assertClubSport(params.clubSportId, params.clubId);

    const openHour = params.openHour ?? 8;
    const closeHour = params.closeHour ?? 22;
    validateHoursAndPrice(openHour, closeHour, params.pricePerHour);

    return prisma.resource.create({
      data: {
        clubId: params.clubId,
        clubSportId: params.clubSportId,
        name,
        attributes: params.attributes ?? {},
        pricePerHour: params.pricePerHour,
        openHour,
        closeHour,
      },
    });
  }

  /** Modifie une ressource en vérifiant qu'elle appartient bien au club. */
  async updateResource(resourceId: string, clubId: string, params: UpdateResourceParams) {
    const resource = await prisma.resource.findUnique({ where: { id: resourceId } });
    // 404 plutôt que 403 si autre club : ne pas divulguer l'existence.
    if (!resource || resource.clubId !== clubId) throw new Error('RESOURCE_NOT_FOUND');

    const openHour = params.openHour ?? resource.openHour;
    const closeHour = params.closeHour ?? resource.closeHour;
    const price = params.pricePerHour ?? Number(resource.pricePerHour);
    validateHoursAndPrice(openHour, closeHour, price);

    if (params.name !== undefined && !params.name.trim()) throw new Error('VALIDATION_ERROR');

    return prisma.resource.update({
      where: { id: resourceId },
      data: {
        ...(params.name !== undefined ? { name: params.name.trim() } : {}),
        ...(params.attributes !== undefined ? { attributes: params.attributes } : {}),
        ...(params.pricePerHour !== undefined ? { pricePerHour: params.pricePerHour } : {}),
        ...(params.openHour !== undefined ? { openHour: params.openHour } : {}),
        ...(params.closeHour !== undefined ? { closeHour: params.closeHour } : {}),
      },
    });
  }

  async setResourceActive(resourceId: string, clubId: string, isActive: boolean) {
    const resource = await prisma.resource.findUnique({ where: { id: resourceId } });
    if (!resource || resource.clubId !== clubId) throw new Error('RESOURCE_NOT_FOUND');

    return prisma.resource.update({ where: { id: resourceId }, data: { isActive } });
  }

  /** Détail public d'une ressource active (pour la page de réservation). */
  async getPublicResource(resourceId: string) {
    const resource = await prisma.resource.findUnique({
      where: { id: resourceId },
      select: {
        id: true, name: true, attributes: true, pricePerHour: true, openHour: true, closeHour: true, isActive: true,
        club: { select: { slug: true, name: true, timezone: true, status: true, accentColor: true } },
        clubSport: { select: { durationsMin: true, sport: { select: { name: true, resourceNoun: true, defaultDurationsMin: true } } } },
      },
    });
    if (!resource || !resource.isActive || resource.club.status !== 'ACTIVE') throw new Error('RESOURCE_NOT_FOUND');
    return resource;
  }
}
