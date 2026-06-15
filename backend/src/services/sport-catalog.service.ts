import { Prisma } from '@prisma/client';
import { prisma } from '../db/prisma';
import { slugify } from './club.service';

const RESOURCE_NOUNS = ['terrain', 'court', 'table', 'piste', 'baie'];

export interface SportInput {
  name?: unknown; key?: unknown; icon?: unknown; resourceNoun?: unknown;
  defaultSlotStepMin?: unknown; defaultDurationsMin?: unknown; surfaces?: unknown;
  published?: unknown;
}

function parseDurations(v: unknown): number[] {
  if (!Array.isArray(v)) throw new Error('VALIDATION_ERROR');
  const out = v.map(Number);
  if (out.length === 0 || out.some((n) => !Number.isInteger(n) || n < 15 || n > 240 || n % 15 !== 0)) throw new Error('VALIDATION_ERROR');
  return Array.from(new Set(out)).sort((a, b) => a - b);
}
function parseSurfaces(v: unknown): string[] {
  if (v === undefined) return [];
  if (!Array.isArray(v)) throw new Error('VALIDATION_ERROR');
  return Array.from(new Set(v.map((s) => String(s).trim()).filter(Boolean)));
}
function parseNoun(v: unknown): string {
  if (typeof v !== 'string' || !RESOURCE_NOUNS.includes(v)) throw new Error('VALIDATION_ERROR');
  return v;
}
function parseStep(v: unknown): number {
  const n = v === undefined ? 30 : Number(v);
  if (!Number.isInteger(n) || n < 15 || n > 240 || n % 15 !== 0) throw new Error('VALIDATION_ERROR');
  return n;
}

export class SportCatalogService {
  async listSports() {
    return prisma.sport.findMany({
      orderBy: { name: 'asc' },
      select: {
        id: true, key: true, name: true, resourceNoun: true,
        defaultSlotStepMin: true, defaultDurationsMin: true, icon: true, surfaces: true, published: true,
      },
    });
  }

  async createSport(input: SportInput) {
    const name = (typeof input.name === 'string' ? input.name : '').trim();
    if (!name) throw new Error('VALIDATION_ERROR');
    const key = slugify(typeof input.key === 'string' && input.key.trim() ? input.key : name);
    if (!key) throw new Error('VALIDATION_ERROR');
    try {
      return await prisma.sport.create({
        data: {
          key, name,
          icon: typeof input.icon === 'string' && input.icon.trim() ? input.icon.trim() : null,
          resourceNoun: parseNoun(input.resourceNoun ?? 'terrain'),
          defaultSlotStepMin: parseStep(input.defaultSlotStepMin),
          defaultDurationsMin: parseDurations(input.defaultDurationsMin),
          surfaces: parseSurfaces(input.surfaces),
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') throw new Error('SPORT_KEY_TAKEN');
      throw err;
    }
  }

  async updateSport(id: string, input: SportInput) {
    const data: Prisma.SportUpdateInput = {};
    if (input.name !== undefined) {
      const name = (typeof input.name === 'string' ? input.name : '').trim();
      if (!name) throw new Error('VALIDATION_ERROR');
      data.name = name;
    }
    if (input.icon !== undefined) data.icon = typeof input.icon === 'string' && input.icon.trim() ? input.icon.trim() : null;
    if (input.resourceNoun !== undefined) data.resourceNoun = parseNoun(input.resourceNoun);
    if (input.defaultSlotStepMin !== undefined) data.defaultSlotStepMin = parseStep(input.defaultSlotStepMin);
    if (input.defaultDurationsMin !== undefined) data.defaultDurationsMin = parseDurations(input.defaultDurationsMin);
    if (input.surfaces !== undefined) data.surfaces = parseSurfaces(input.surfaces);
    if (input.published !== undefined) data.published = Boolean(input.published);
    // `key` volontairement jamais repris : identifiant immuable.
    if (Object.keys(data).length === 0) throw new Error('VALIDATION_ERROR');
    try {
      return await prisma.sport.update({ where: { id }, data });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') throw new Error('SPORT_NOT_FOUND');
      throw err;
    }
  }

  async deleteSport(id: string) {
    if ((await prisma.clubSport.count({ where: { sportId: id } })) > 0) throw new Error('SPORT_IN_USE');
    try {
      await prisma.sport.delete({ where: { id } });
      return { id };
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2003') throw new Error('SPORT_IN_USE');
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') throw new Error('SPORT_NOT_FOUND');
      throw err;
    }
  }
}
