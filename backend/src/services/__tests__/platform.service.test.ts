import '../../__mocks__/prisma';
import { prismaMock } from '../../__mocks__/prisma';
import { Prisma } from '@prisma/client';
import { PlatformService } from '../platform.service';

describe('PlatformService.getStats', () => {
  const service = new PlatformService();

  it('agrège les compteurs globaux', async () => {
    prismaMock.club.count
      .mockResolvedValueOnce(5)   // total
      .mockResolvedValueOnce(4)   // active
      .mockResolvedValueOnce(1);  // suspended
    prismaMock.user.count.mockResolvedValue(120 as any);
    prismaMock.reservation.count.mockResolvedValue(300 as any);
    prismaMock.tournament.count.mockResolvedValue(8 as any);

    const stats = await service.getStats();
    expect(stats).toEqual({
      clubs: { total: 5, active: 4, suspended: 1 },
      users: 120,
      reservations: 300,
      tournaments: 8,
    });
  });
});

describe('PlatformService.listClubs', () => {
  const service = new PlatformService();

  it('renvoie tous les clubs (tous statuts) avec gérants et compteurs', async () => {
    prismaMock.club.findMany.mockResolvedValue([
      {
        id: 'club-demo', slug: 'padel-arena-paris', name: 'Padel Arena Paris',
        city: 'Paris', status: 'SUSPENDED', createdAt: new Date('2026-01-01'),
        members: [{ user: { id: 'u1', email: 'owner@palova.fr', firstName: 'O', lastName: 'M' } }],
        _count: { clubMemberships: 48, resources: 5 },
        slugAliases: [],
      },
    ] as any);

    const clubs = await service.listClubs();
    expect(prismaMock.club.findMany).toHaveBeenCalledWith(expect.objectContaining({
      orderBy: { createdAt: 'desc' },
    }));
    expect(clubs[0]).toEqual({
      id: 'club-demo', slug: 'padel-arena-paris', name: 'Padel Arena Paris',
      city: 'Paris', status: 'SUSPENDED', createdAt: new Date('2026-01-01'),
      owners: [{ id: 'u1', email: 'owner@palova.fr', firstName: 'O', lastName: 'M' }],
      counts: { adherents: 48, resources: 5 },
      aliases: [],
    });
  });
});

describe('PlatformService.setClubStatus', () => {
  const service = new PlatformService();

  it('met à jour le statut quand il est valide', async () => {
    prismaMock.club.update.mockResolvedValue({ id: 'club-demo', status: 'SUSPENDED' } as any);
    const club = await service.setClubStatus('club-demo', 'SUSPENDED');
    expect(prismaMock.club.update).toHaveBeenCalledWith({
      where: { id: 'club-demo' }, data: { status: 'SUSPENDED' },
    });
    expect(club.status).toBe('SUSPENDED');
  });

  it('rejette VALIDATION_ERROR si le statut est invalide', async () => {
    await expect(service.setClubStatus('club-demo', 'BANNED' as any)).rejects.toThrow('VALIDATION_ERROR');
    expect(prismaMock.club.update).not.toHaveBeenCalled();
  });

  it('rejette CLUB_NOT_FOUND si le club n existe pas (P2025)', async () => {
    prismaMock.club.update.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('not found', { code: 'P2025', clientVersion: 'x' }),
    );
    await expect(service.setClubStatus('absent', 'ACTIVE')).rejects.toThrow('CLUB_NOT_FOUND');
  });
});

describe('PlatformService.createClubWithOwner', () => {
  const service = new PlatformService();
  const validBody = {
    club: { name: 'Nantes Padel', city: 'Nantes', sportKey: 'padel' },
    owner: { firstName: 'Léa', lastName: 'Roux', email: 'lea@nantes.fr', password: 'password123' },
  };

  it('rejette VALIDATION_ERROR si un champ requis manque', async () => {
    await expect(service.createClubWithOwner({ ...validBody, club: { name: '' } } as any))
      .rejects.toThrow('VALIDATION_ERROR');
  });

  it('rejette VALIDATION_ERROR si le mot de passe fait moins de 8 caractères', async () => {
    await expect(service.createClubWithOwner({ ...validBody, owner: { ...validBody.owner, password: 'court' } }))
      .rejects.toThrow('VALIDATION_ERROR');
  });

  it('rejette EMAIL_TAKEN si l email gérant existe déjà', async () => {
    prismaMock.user.findFirst.mockResolvedValue({ id: 'u-exist' } as any);
    await expect(service.createClubWithOwner(validBody)).rejects.toThrow('EMAIL_TAKEN');
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('rejette SLUG_RESERVED si le nom slugifie vers un libellé technique (ex. API)', async () => {
    await expect(service.createClubWithOwner({ ...validBody, club: { name: 'API' } }))
      .rejects.toThrow('SLUG_RESERVED');
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('rejette SLUG_TAKEN si le slug est un alias historique (vérifié dans la transaction)', async () => {
    prismaMock.user.findFirst.mockResolvedValue(null as any);
    const tx = {
      clubSlugAlias: { findUnique: jest.fn().mockResolvedValue({ slug: 'nantes-padel' }) },
      user: { create: jest.fn() },
      club: { create: jest.fn() },
      clubMember: { create: jest.fn() },
      sport: { findUnique: jest.fn() },
      clubSport: { create: jest.fn() },
    };
    prismaMock.$transaction.mockImplementation(async (cb: any) => cb(tx));
    await expect(service.createClubWithOwner(validBody)).rejects.toThrow('SLUG_TAKEN');
    expect(tx.club.create).not.toHaveBeenCalled();
  });

  it('rejette SLUG_TAKEN si le slug est déjà pris (P2002 sur slug)', async () => {
    prismaMock.user.findFirst.mockResolvedValue(null as any);
    const tx = {
      clubSlugAlias: { findUnique: jest.fn().mockResolvedValue(null) },
      user: { create: jest.fn().mockResolvedValue({ id: 'u-new', email: 'lea@nantes.fr', firstName: 'Léa', lastName: 'Roux' }) },
      club: { create: jest.fn().mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x', meta: { target: ['slug'] } }),
      ) },
      clubMember: { create: jest.fn() },
      sport: { findUnique: jest.fn() },
      clubSport: { create: jest.fn() },
    };
    prismaMock.$transaction.mockImplementation(async (cb: any) => cb(tx));
    await expect(service.createClubWithOwner(validBody)).rejects.toThrow('SLUG_TAKEN');
  });

  it('crée le gérant, le club, le ClubMember OWNER et le ClubSport', async () => {
    prismaMock.user.findFirst.mockResolvedValue(null as any);
    const tx = {
      clubSlugAlias: { findUnique: jest.fn().mockResolvedValue(null) },
      user: { create: jest.fn().mockResolvedValue({ id: 'u-new', email: 'lea@nantes.fr', firstName: 'Léa', lastName: 'Roux' }) },
      club: { create: jest.fn().mockResolvedValue({ id: 'club-new', slug: 'nantes-padel', name: 'Nantes Padel', status: 'ACTIVE' }) },
      clubMember: { create: jest.fn().mockResolvedValue({}) },
      sport: { findUnique: jest.fn().mockResolvedValue({ id: 'sport-padel', key: 'padel' }) },
      clubSport: { create: jest.fn().mockResolvedValue({}) },
    };
    prismaMock.$transaction.mockImplementation(async (cb: any) => cb(tx));

    const result = await service.createClubWithOwner(validBody);
    expect(tx.user.create).toHaveBeenCalled();
    expect(tx.clubMember.create).toHaveBeenCalledWith({ data: { userId: 'u-new', clubId: 'club-new', role: 'OWNER' } });
    expect(tx.clubSport.create).toHaveBeenCalled();
    expect(result.club.slug).toBe('nantes-padel');
    expect(result.owner.email).toBe('lea@nantes.fr');
  });
});

describe('PlatformService.changeClubSlug', () => {
  const service = new PlatformService();

  function makeTx(overrides: { clubBySlug?: unknown; alias?: unknown } = {}) {
    return {
      club: {
        findUnique: jest.fn().mockResolvedValue(overrides.clubBySlug ?? null),
        update: jest.fn().mockImplementation(async ({ data }: { data: { slug: string } }) =>
          ({ id: 'club-1', slug: data.slug, name: 'Padel Arena' })),
      },
      clubSlugAlias: {
        findUnique: jest.fn().mockResolvedValue(overrides.alias ?? null),
        delete: jest.fn().mockResolvedValue({}),
        create: jest.fn().mockResolvedValue({}),
      },
    };
  }

  beforeEach(() => {
    // Club ciblé existant, slug actuel 'old-arena'.
    prismaMock.club.findUnique.mockResolvedValue({ id: 'club-1', slug: 'old-arena', name: 'Padel Arena' } as any);
  });

  it('SLUG_INVALID si le slug normalisé est vide', async () => {
    await expect(service.changeClubSlug('club-1', '!!!')).rejects.toThrow('SLUG_INVALID');
    await expect(service.changeClubSlug('club-1', undefined)).rejects.toThrow('SLUG_INVALID');
  });

  it('SLUG_RESERVED pour les libellés techniques (www, app, api, superadmin)', async () => {
    for (const s of ['www', 'app', 'api', 'superadmin']) {
      await expect(service.changeClubSlug('club-1', s)).rejects.toThrow('SLUG_RESERVED');
    }
  });

  it('CLUB_NOT_FOUND si le club n existe pas', async () => {
    prismaMock.club.findUnique.mockResolvedValue(null as any);
    await expect(service.changeClubSlug('absent', 'nouveau')).rejects.toThrow('CLUB_NOT_FOUND');
  });

  it('no-op (aucune transaction) si le slug est inchangé', async () => {
    const out = await service.changeClubSlug('club-1', 'Old Arena'); // slugify → 'old-arena'
    expect(out).toEqual({ id: 'club-1', slug: 'old-arena', name: 'Padel Arena' });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('SLUG_TAKEN si le slug est le slug actuel d un autre club', async () => {
    const tx = makeTx({ clubBySlug: { id: 'club-2' } });
    prismaMock.$transaction.mockImplementation(async (cb: any) => cb(tx));
    await expect(service.changeClubSlug('club-1', 'pris')).rejects.toThrow('SLUG_TAKEN');
  });

  it('SLUG_TAKEN si le slug est un alias appartenant à un AUTRE club', async () => {
    const tx = makeTx({ alias: { clubId: 'club-2' } });
    prismaMock.$transaction.mockImplementation(async (cb: any) => cb(tx));
    await expect(service.changeClubSlug('club-1', 'ancien-d-un-autre')).rejects.toThrow('SLUG_TAKEN');
  });

  it('swap-back : reprendre son propre alias supprime la ligne d alias puis bascule', async () => {
    const tx = makeTx({ alias: { clubId: 'club-1' } });
    prismaMock.$transaction.mockImplementation(async (cb: any) => cb(tx));
    const out = await service.changeClubSlug('club-1', 'mon-ancien-slug');
    expect(tx.clubSlugAlias.delete).toHaveBeenCalledWith({ where: { slug: 'mon-ancien-slug' } });
    expect(tx.clubSlugAlias.create).toHaveBeenCalledWith({ data: { slug: 'old-arena', clubId: 'club-1' } });
    expect(out.slug).toBe('mon-ancien-slug');
  });

  it('insère l ancien slug en alias et met à jour le club (normalisation slugify)', async () => {
    const tx = makeTx();
    prismaMock.$transaction.mockImplementation(async (cb: any) => cb(tx));
    const out = await service.changeClubSlug('club-1', 'Pâdel Çlub  Paris!');
    expect(tx.clubSlugAlias.create).toHaveBeenCalledWith({ data: { slug: 'old-arena', clubId: 'club-1' } });
    expect(tx.club.update).toHaveBeenCalledWith({
      where: { id: 'club-1' },
      data: { slug: 'padel-club-paris' },
      select: { id: true, slug: true, name: true },
    });
    expect(out).toEqual({ id: 'club-1', slug: 'padel-club-paris', name: 'Padel Arena' });
  });
});
