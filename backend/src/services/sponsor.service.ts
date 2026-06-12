import { prisma } from '../db/prisma';

interface SponsorInput { name?: string; logoUrl?: string; linkUrl?: string | null; sortOrder?: number; isActive?: boolean; offerText?: string | null; offerCode?: string | null; offerUntil?: string | null; pinned?: boolean; }

/** `YYYY-MM-DD` → fin de journée UTC (tolérance fuseau assumée pour une date de promo). Vide/null → null. */
function parseOfferUntil(v: string | null | undefined): Date | null {
  if (!v || !v.trim()) return null;
  const d = new Date(`${v.trim()}T23:59:59.999Z`);
  if (isNaN(d.getTime())) throw new Error('VALIDATION_ERROR');
  return d;
}

export class SponsorService {
  async listPublic(slug: string) {
    const club = await prisma.club.findUnique({ where: { slug }, select: { id: true, status: true } });
    if (!club || club.status !== 'ACTIVE') throw new Error('CLUB_NOT_FOUND');
    // Le partenaire « à la une » d'abord, puis l'ordre choisi par le club.
    return prisma.sponsor.findMany({ where: { clubId: club.id, isActive: true }, orderBy: [{ pinned: 'desc' }, { sortOrder: 'asc' }] });
  }

  async listAdmin(clubId: string) {
    return prisma.sponsor.findMany({ where: { clubId }, orderBy: { sortOrder: 'asc' } });
  }

  async create(clubId: string, data: SponsorInput) {
    const name = (data.name ?? '').trim();
    const logoUrl = (data.logoUrl ?? '').trim();
    if (!name || !logoUrl) throw new Error('VALIDATION_ERROR');
    return prisma.sponsor.create({
      data: {
        clubId, name, logoUrl,
        linkUrl: data.linkUrl?.trim() || null,
        sortOrder: Number.isInteger(data.sortOrder) ? data.sortOrder! : 0,
        isActive: data.isActive ?? true,
        offerText: data.offerText?.trim() || null,
        offerCode: data.offerCode?.trim() || null,
        offerUntil: parseOfferUntil(data.offerUntil),
        pinned: data.pinned ?? false,
      },
    });
  }

  async update(id: string, clubId: string, data: SponsorInput) {
    const found = await prisma.sponsor.findUnique({ where: { id }, select: { clubId: true } });
    if (!found || found.clubId !== clubId) throw new Error('SPONSOR_NOT_FOUND');
    return prisma.sponsor.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name.trim() } : {}),
        ...(data.logoUrl !== undefined ? { logoUrl: data.logoUrl.trim() } : {}),
        ...(data.linkUrl !== undefined ? { linkUrl: data.linkUrl?.trim() || null } : {}),
        ...(data.sortOrder !== undefined ? { sortOrder: Number(data.sortOrder) } : {}),
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
        ...(data.offerText !== undefined ? { offerText: data.offerText?.trim() || null } : {}),
        ...(data.offerCode !== undefined ? { offerCode: data.offerCode?.trim() || null } : {}),
        ...(data.offerUntil !== undefined ? { offerUntil: parseOfferUntil(data.offerUntil) } : {}),
        ...(data.pinned !== undefined ? { pinned: !!data.pinned } : {}),
      },
    });
  }

  async remove(id: string, clubId: string) {
    await prisma.sponsor.deleteMany({ where: { id, clubId } });
  }
}
