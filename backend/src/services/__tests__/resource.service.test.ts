import '../../__mocks__/prisma';
import { prismaMock } from '../../__mocks__/prisma';
import { ResourceService } from '../resource.service';

describe('ResourceService', () => {
  let service: ResourceService;
  beforeEach(() => { service = new ResourceService(); });

  describe('createResource', () => {
    it('crée une ressource valide avec horaires par défaut', async () => {
      prismaMock.clubSport.findUnique.mockResolvedValue({ clubId: 'club-demo' } as any);
      prismaMock.resource.create.mockResolvedValue({ id: 'r1' } as any);

      const res = await service.createResource({
        clubId: 'club-demo', clubSportId: 'cs-1', name: 'Terrain 4', pricePerHour: 30,
      });

      expect(prismaMock.resource.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          clubId: 'club-demo', clubSportId: 'cs-1', name: 'Terrain 4', pricePerHour: 30, openHour: 8, closeHour: 22,
        }),
      }));
      expect(res.id).toBe('r1');
    });

    it('rejette CLUB_SPORT_NOT_FOUND si le clubSport appartient à un autre club (isolation)', async () => {
      prismaMock.clubSport.findUnique.mockResolvedValue({ clubId: 'autre-club' } as any);

      await expect(service.createResource({ clubId: 'club-demo', clubSportId: 'cs-x', name: 'T', pricePerHour: 30 }))
        .rejects.toThrow('CLUB_SPORT_NOT_FOUND');
      expect(prismaMock.resource.create).not.toHaveBeenCalled();
    });

    it('rejette VALIDATION_ERROR si pricePerHour <= 0', async () => {
      prismaMock.clubSport.findUnique.mockResolvedValue({ clubId: 'club-demo' } as any);
      await expect(service.createResource({ clubId: 'club-demo', clubSportId: 'cs-1', name: 'T4', pricePerHour: 0 }))
        .rejects.toThrow('VALIDATION_ERROR');
    });

    it('rejette VALIDATION_ERROR si name vide', async () => {
      await expect(service.createResource({ clubId: 'club-demo', clubSportId: 'cs-1', name: '   ', pricePerHour: 30 }))
        .rejects.toThrow('VALIDATION_ERROR');
    });
  });

  describe('updateResource (isolation multi-tenant)', () => {
    it('rejette RESOURCE_NOT_FOUND si la ressource appartient à un autre club', async () => {
      prismaMock.resource.findUnique.mockResolvedValue({
        id: 'r1', clubId: 'autre-club', openHour: 8, closeHour: 22, pricePerHour: 25,
      } as any);

      await expect(service.updateResource('r1', 'club-demo', { pricePerHour: 30 }))
        .rejects.toThrow('RESOURCE_NOT_FOUND');
      expect(prismaMock.resource.update).not.toHaveBeenCalled();
    });

    it('met à jour le tarif (validation sur horaires existants mergés)', async () => {
      prismaMock.resource.findUnique.mockResolvedValue({
        id: 'r1', clubId: 'club-demo', openHour: 8, closeHour: 22, pricePerHour: 25,
      } as any);
      prismaMock.resource.update.mockResolvedValue({ id: 'r1', pricePerHour: 28 } as any);

      await service.updateResource('r1', 'club-demo', { pricePerHour: 28 });

      expect(prismaMock.resource.update).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: 'r1' }, data: { pricePerHour: 28 },
      }));
    });
  });

  describe('setResourceActive', () => {
    it('désactive une ressource du club', async () => {
      prismaMock.resource.findUnique.mockResolvedValue({ id: 'r1', clubId: 'club-demo' } as any);
      prismaMock.resource.update.mockResolvedValue({ id: 'r1', isActive: false } as any);

      await service.setResourceActive('r1', 'club-demo', false);

      expect(prismaMock.resource.update).toHaveBeenCalledWith({
        where: { id: 'r1' }, data: { isActive: false },
      });
    });

    it('rejette RESOURCE_NOT_FOUND pour une ressource d un autre club', async () => {
      prismaMock.resource.findUnique.mockResolvedValue({ id: 'r1', clubId: 'autre' } as any);
      await expect(service.setResourceActive('r1', 'club-demo', false)).rejects.toThrow('RESOURCE_NOT_FOUND');
    });
  });
});
