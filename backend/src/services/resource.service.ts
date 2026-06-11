import { Prisma } from '@prisma/client';
import { prisma } from '../db/prisma';

interface CreateResourceParams {
  clubId: string;
  clubSportId: string;
  name: string;
  attributes?: Prisma.InputJsonValue;
  pricePerHour: number;
  offPeakPricePerHour?: number | null;
  openHour?: number;
  closeHour?: number;
  slotStepMin?: number | null;
}

interface UpdateResourceParams {
  name?: string;
  attributes?: Prisma.InputJsonValue;
  pricePerHour?: number;
  offPeakPricePerHour?: number | null;
  openHour?: number;
  closeHour?: number;
  slotStepMin?: number | null;
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

/** Tarif heures creuses, si fourni (non null), doit être un nombre > 0. null = pas de remise. */
function validateOffPeak(v?: number | null): void {
  if (v === undefined || v === null) return;
  if (typeof v !== 'number' || isNaN(v) || v <= 0) throw new Error('VALIDATION_ERROR');
}

/** Le pas du créneau, si fourni, doit être un multiple de 15 entre 15 et 240. */
function validateSlotStep(step?: number | null): void {
  if (step === undefined || step === null) return;
  if (!Number.isInteger(step) || step < 15 || step > 240 || step % 15 !== 0) {
    throw new Error('VALIDATION_ERROR');
  }
}

/** Ordre d'affichage stocké dans attributes.sortOrder (0 par défaut). */
function sortOrderOf(attributes: unknown): number {
  const v = (attributes as { sortOrder?: unknown } | null)?.sortOrder;
  return typeof v === 'number' ? v : 0;
}

/** Trie une liste de ressources par sortOrder, puis par nom (stable). */
export function bySortOrder<T extends { attributes: unknown; name: string }>(a: T, b: T): number {
  return sortOrderOf(a.attributes) - sortOrderOf(b.attributes) || a.name.localeCompare(b.name, 'fr', { numeric: true });
}

export class ResourceService {
  /** Liste toutes les ressources d'un club (y compris désactivées), ordre manuel. */
  async listClubResources(clubId: string) {
    const resources = await prisma.resource.findMany({
      where: { clubId },
      select: {
        id: true, name: true, attributes: true, isActive: true,
        pricePerHour: true, offPeakPricePerHour: true, openHour: true, closeHour: true, slotStepMin: true,
        clubSport: { select: { id: true, slotStepMin: true, durationsMin: true, sport: { select: { key: true, name: true, resourceNoun: true, defaultSlotStepMin: true, defaultDurationsMin: true } } } },
      },
    });
    return resources.sort(bySortOrder);
  }

  /** Réordonne les ressources d'un club selon la liste d'ids fournie. */
  async reorderResources(clubId: string, orderedIds: string[]) {
    const resources = await prisma.resource.findMany({
      where: { clubId },
      select: { id: true, attributes: true },
    });
    const byId = new Map(resources.map((r) => [r.id, r]));
    // Tous les ids doivent appartenir au club (sinon 404, on ne divulgue pas).
    for (const id of orderedIds) {
      if (!byId.has(id)) throw new Error('RESOURCE_NOT_FOUND');
    }
    await prisma.$transaction(
      orderedIds.map((id, i) =>
        prisma.resource.update({
          where: { id },
          data: { attributes: { ...(byId.get(id)!.attributes as Record<string, unknown>), sortOrder: i } as Prisma.InputJsonValue },
        }),
      ),
    );
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
    validateOffPeak(params.offPeakPricePerHour);
    validateSlotStep(params.slotStepMin);

    // Nouveau terrain ajouté en fin de liste (sortOrder = nombre actuel).
    const sortOrder = await prisma.resource.count({ where: { clubId: params.clubId } });

    return prisma.resource.create({
      data: {
        clubId: params.clubId,
        clubSportId: params.clubSportId,
        name,
        attributes: { ...((params.attributes as Record<string, unknown>) ?? {}), sortOrder } as Prisma.InputJsonValue,
        pricePerHour: params.pricePerHour,
        offPeakPricePerHour: params.offPeakPricePerHour ?? null,
        openHour,
        closeHour,
        slotStepMin: params.slotStepMin ?? null,
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
    validateOffPeak(params.offPeakPricePerHour);
    validateSlotStep(params.slotStepMin);

    if (params.name !== undefined && !params.name.trim()) throw new Error('VALIDATION_ERROR');

    return prisma.resource.update({
      where: { id: resourceId },
      data: {
        ...(params.name !== undefined ? { name: params.name.trim() } : {}),
        ...(params.attributes !== undefined ? { attributes: params.attributes } : {}),
        ...(params.pricePerHour !== undefined ? { pricePerHour: params.pricePerHour } : {}),
        ...(params.offPeakPricePerHour !== undefined ? { offPeakPricePerHour: params.offPeakPricePerHour } : {}),
        ...(params.openHour !== undefined ? { openHour: params.openHour } : {}),
        ...(params.closeHour !== undefined ? { closeHour: params.closeHour } : {}),
        ...(params.slotStepMin !== undefined ? { slotStepMin: params.slotStepMin } : {}),
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
        id: true, name: true, attributes: true, pricePerHour: true, offPeakPricePerHour: true, openHour: true, closeHour: true, isActive: true,
        club: { select: { slug: true, name: true, timezone: true, status: true, accentColor: true } },
        clubSport: { select: { durationsMin: true, sport: { select: { name: true, resourceNoun: true, defaultDurationsMin: true } } } },
      },
    });
    if (!resource || !resource.isActive || resource.club.status !== 'ACTIVE') throw new Error('RESOURCE_NOT_FOUND');
    return resource;
  }
}
