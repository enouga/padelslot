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

  it('crée le gérant, le club, le ClubMember OWNER et le ClubSport', async () => {
    prismaMock.user.findFirst.mockResolvedValue(null as any);
    const tx = {
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
