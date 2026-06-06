import '../../__mocks__/prisma';
import '../../__mocks__/redis';
import { prismaMock } from '../../__mocks__/prisma';
import { redisMock } from '../../__mocks__/redis';
import { ReservationService } from '../reservation.service';

const mockBroadcast = jest.fn();

jest.mock('../sse.service', () => ({
  SSEService: { getInstance: jest.fn(() => ({ broadcast: mockBroadcast })) },
}));

const sseBroadcast = () => mockBroadcast;

describe('ReservationService', () => {
  let service: ReservationService;

  beforeEach(() => {
    service = new ReservationService();
    mockBroadcast.mockReset();
  });

  const baseParams = {
    resourceId: 'court-1',
    userId:     'user-1',
    startTime:  new Date('2025-06-15T08:00:00.000Z'),
    endTime:    new Date('2025-06-15T09:00:00.000Z'),
  };

  describe('holdSlot', () => {
    it('crée une PENDING reservation si le lock Redis est libre et le créneau disponible', async () => {
      redisMock.set.mockResolvedValue('OK');
      prismaMock.reservation.count.mockResolvedValue(0);
      prismaMock.resource.findUniqueOrThrow.mockResolvedValue({ pricePerHour: 25, clubId: 'club-demo', club: { timezone: 'Europe/Paris', publicBookingDays: 7, memberBookingDays: 14 } } as any);
      prismaMock.reservation.create.mockResolvedValue({
        id: 'res-1', ...baseParams, status: 'PENDING', totalPrice: 25,
        createdAt: new Date(),
      } as any);

      const result = await service.holdSlot(baseParams);

      expect(redisMock.set).toHaveBeenCalledWith(
        expect.stringContaining('lock:resource:court-1:'),
        'user-1', 'EX', 600, 'NX',
      );
      expect(prismaMock.reservation.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'PENDING', resourceId: 'court-1' }),
        }),
      );
      expect(result.status).toBe('PENDING');
    });

    it('lève SLOT_ALREADY_HELD si Redis NX retourne null', async () => {
      redisMock.set.mockResolvedValue(null);

      await expect(service.holdSlot(baseParams)).rejects.toThrow('SLOT_ALREADY_HELD');
      expect(prismaMock.reservation.count).not.toHaveBeenCalled();
    });

    it('lève SLOT_NOT_AVAILABLE et supprime le lock si conflit DB', async () => {
      redisMock.set.mockResolvedValue('OK');
      prismaMock.resource.findUniqueOrThrow.mockResolvedValue({ pricePerHour: 25, clubId: 'club-demo', club: { timezone: 'Europe/Paris', publicBookingDays: 7, memberBookingDays: 14 } } as any);
      prismaMock.reservation.count.mockResolvedValue(1);

      await expect(service.holdSlot(baseParams)).rejects.toThrow('SLOT_NOT_AVAILABLE');
      expect(redisMock.del).toHaveBeenCalledWith(
        expect.stringContaining('lock:resource:court-1:'),
      );
    });

    it('lève BOOKING_TOO_FAR si la date dépasse la fenêtre publique', async () => {
      redisMock.set.mockResolvedValue('OK');
      prismaMock.resource.findUniqueOrThrow.mockResolvedValue({ pricePerHour: 25, clubId: 'club-demo', club: { timezone: 'Europe/Paris', publicBookingDays: 7, memberBookingDays: 14 } } as any);
      prismaMock.clubMembership.findUnique.mockResolvedValue(null as any);

      const far = new Date(Date.now() + 60 * 24 * 3600 * 1000); // +60 jours
      await expect(service.holdSlot({
        resourceId: 'court-1', userId: 'user-1', startTime: far, endTime: new Date(far.getTime() + 3_600_000),
      })).rejects.toThrow('BOOKING_TOO_FAR');
      expect(prismaMock.reservation.count).not.toHaveBeenCalled();
    });

    it('lève MEMBERSHIP_BLOCKED si le membre est bloqué par le club', async () => {
      redisMock.set.mockResolvedValue('OK');
      prismaMock.resource.findUniqueOrThrow.mockResolvedValue({ pricePerHour: 25, clubId: 'club-demo', club: { timezone: 'Europe/Paris', publicBookingDays: 7, memberBookingDays: 14 } } as any);
      prismaMock.clubMembership.findUnique.mockResolvedValue({ status: 'BLOCKED', isSubscriber: false } as any);

      await expect(service.holdSlot(baseParams)).rejects.toThrow('MEMBERSHIP_BLOCKED');
      expect(prismaMock.reservation.count).not.toHaveBeenCalled();
      expect(prismaMock.clubMembership.create).not.toHaveBeenCalled();
    });

    it('crée une adhésion ACTIVE automatiquement au 1er créneau (membre absent)', async () => {
      redisMock.set.mockResolvedValue('OK');
      prismaMock.reservation.count.mockResolvedValue(0);
      prismaMock.resource.findUniqueOrThrow.mockResolvedValue({ pricePerHour: 25, clubId: 'club-demo', club: { timezone: 'Europe/Paris', publicBookingDays: 7, memberBookingDays: 14 } } as any);
      prismaMock.clubMembership.findUnique.mockResolvedValue(null as any);
      prismaMock.reservation.create.mockResolvedValue({ id: 'res-1', ...baseParams, status: 'PENDING', totalPrice: 25, createdAt: new Date() } as any);

      await service.holdSlot(baseParams);

      expect(prismaMock.clubMembership.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ userId: 'user-1', clubId: 'club-demo' }) }),
      );
    });

    it('broadcast slot_held après création réussie', async () => {
      redisMock.set.mockResolvedValue('OK');
      prismaMock.reservation.count.mockResolvedValue(0);
      prismaMock.resource.findUniqueOrThrow.mockResolvedValue({ pricePerHour: 25, clubId: 'club-demo', club: { timezone: 'Europe/Paris', publicBookingDays: 7, memberBookingDays: 14 } } as any);
      prismaMock.reservation.create.mockResolvedValue({
        id: 'res-1', ...baseParams, status: 'PENDING', totalPrice: 25,
        createdAt: new Date(),
      } as any);

      await service.holdSlot(baseParams);

      expect(sseBroadcast()).toHaveBeenCalledWith(
        'court-1',
        expect.objectContaining({ type: 'slot_held', reservationId: 'res-1' }),
      );
    });
  });

  describe('cancelReservation', () => {
    it('annule une réservation CONFIRMED et broadcast slot_released', async () => {
      prismaMock.reservation.findUnique.mockResolvedValue({
        id: 'res-1', resourceId: 'court-1', userId: 'user-1',
        status: 'CONFIRMED',
        startTime: baseParams.startTime,
        endTime:   baseParams.endTime,
      } as any);
      prismaMock.reservation.update.mockResolvedValue({
        id: 'res-1', status: 'CANCELLED',
        resourceId: 'court-1',
        startTime: baseParams.startTime,
        endTime:   baseParams.endTime,
      } as any);
      redisMock.del.mockResolvedValue(1);

      await service.cancelReservation('res-1', 'user-1');

      expect(prismaMock.reservation.update).toHaveBeenCalledWith({
        where: { id: 'res-1' },
        data: { status: 'CANCELLED', cancelledAt: expect.any(Date) },
      });
      expect(sseBroadcast()).toHaveBeenCalledWith(
        'court-1',
        expect.objectContaining({ type: 'slot_released' }),
      );
    });

    it('lève UNAUTHORIZED si userId ne correspond pas', async () => {
      prismaMock.reservation.findUnique.mockResolvedValue({
        id: 'res-1', userId: 'user-other', status: 'CONFIRMED',
      } as any);

      await expect(service.cancelReservation('res-1', 'user-1')).rejects.toThrow('UNAUTHORIZED');
    });

    it('lève ALREADY_CANCELLED si déjà annulée', async () => {
      prismaMock.reservation.findUnique.mockResolvedValue({
        id: 'res-1', userId: 'user-1', status: 'CANCELLED',
      } as any);

      await expect(service.cancelReservation('res-1', 'user-1')).rejects.toThrow('ALREADY_CANCELLED');
    });

    it('lève RESERVATION_NOT_FOUND si inexistante', async () => {
      prismaMock.reservation.findUnique.mockResolvedValue(null);

      await expect(service.cancelReservation('res-99', 'user-1')).rejects.toThrow('RESERVATION_NOT_FOUND');
    });
  });

  describe('adminCancelReservation (isolation multi-tenant)', () => {
    it('annule une résa d un AUTRE user du même club + redis.del + broadcast slot_released', async () => {
      prismaMock.reservation.findUnique.mockResolvedValue({
        id: 'res-1', resourceId: 'court-1', userId: 'autre-user', status: 'CONFIRMED',
        startTime: baseParams.startTime, endTime: baseParams.endTime,
        resource: { clubId: 'club-demo' },
      } as any);
      prismaMock.reservation.update.mockResolvedValue({
        id: 'res-1', status: 'CANCELLED', resourceId: 'court-1',
        startTime: baseParams.startTime, endTime: baseParams.endTime,
      } as any);
      redisMock.del.mockResolvedValue(1);

      await service.adminCancelReservation('res-1', 'club-demo');

      expect(prismaMock.reservation.update).toHaveBeenCalledWith({
        where: { id: 'res-1' },
        data: { status: 'CANCELLED', cancelledAt: expect.any(Date) },
      });
      expect(redisMock.del).toHaveBeenCalled();
      expect(sseBroadcast()).toHaveBeenCalledWith(
        'court-1', expect.objectContaining({ type: 'slot_released' }),
      );
    });

    it('lève CLUB_MISMATCH si la résa appartient à un autre club', async () => {
      prismaMock.reservation.findUnique.mockResolvedValue({
        id: 'res-1', resourceId: 'court-1', status: 'CONFIRMED', resource: { clubId: 'autre-club' },
      } as any);

      await expect(service.adminCancelReservation('res-1', 'club-demo')).rejects.toThrow('CLUB_MISMATCH');
      expect(prismaMock.reservation.update).not.toHaveBeenCalled();
    });

    it('lève ALREADY_CANCELLED si déjà annulée', async () => {
      prismaMock.reservation.findUnique.mockResolvedValue({
        id: 'res-1', status: 'CANCELLED', resource: { clubId: 'club-demo' },
      } as any);

      await expect(service.adminCancelReservation('res-1', 'club-demo')).rejects.toThrow('ALREADY_CANCELLED');
    });

    it('lève RESERVATION_NOT_FOUND si inexistante', async () => {
      prismaMock.reservation.findUnique.mockResolvedValue(null);

      await expect(service.adminCancelReservation('res-x', 'club-demo')).rejects.toThrow('RESERVATION_NOT_FOUND');
    });
  });

  describe('adminCreateReservation', () => {
    const base = {
      clubId: 'club-demo', resourceId: 'court-1', date: '2026-06-15',
      startTime: '18:00', endTime: '19:00', type: 'EVENT' as const,
    };
    const mockResource = () => prismaMock.resource.findUnique.mockResolvedValue(
      { clubId: 'club-demo', club: { timezone: 'Europe/Paris' } } as any);

    it('crée un événement CONFIRMED sans membre (userId null) + broadcast slot_confirmed', async () => {
      mockResource();
      prismaMock.$transaction.mockImplementation(async (cb: any) => cb(prismaMock));
      prismaMock.reservation.count.mockResolvedValue(0 as any);
      prismaMock.reservation.create.mockResolvedValue({ id: 'r-new', resourceId: 'court-1', startTime: new Date(), endTime: new Date() } as any);

      const res = await service.adminCreateReservation({ ...base, title: 'Maintenance' });

      expect(prismaMock.reservation.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ status: 'CONFIRMED', type: 'EVENT', userId: null, title: 'Maintenance', resourceId: 'court-1' }),
      }));
      expect(sseBroadcast()).toHaveBeenCalledWith('court-1', expect.objectContaining({ type: 'slot_confirmed', reservationId: 'r-new' }));
      expect(res.id).toBe('r-new');
    });

    it('rattache le membre quand memberUserId est fourni et membre du club', async () => {
      mockResource();
      prismaMock.clubMembership.findUnique.mockResolvedValue({ id: 'm1', status: 'ACTIVE' } as any);
      prismaMock.$transaction.mockImplementation(async (cb: any) => cb(prismaMock));
      prismaMock.reservation.count.mockResolvedValue(0 as any);
      prismaMock.reservation.create.mockResolvedValue({ id: 'r-new', resourceId: 'court-1', startTime: new Date(), endTime: new Date() } as any);

      await service.adminCreateReservation({ ...base, type: 'COURT', memberUserId: 'user-9' });

      expect(prismaMock.reservation.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ userId: 'user-9', type: 'COURT' }),
      }));
    });

    it('lève VALIDATION_ERROR si le membre n appartient pas au club', async () => {
      mockResource();
      prismaMock.clubMembership.findUnique.mockResolvedValue(null as any);
      await expect(service.adminCreateReservation({ ...base, memberUserId: 'user-x' })).rejects.toThrow('VALIDATION_ERROR');
    });

    it('lève RESOURCE_NOT_FOUND si la ressource n existe pas', async () => {
      prismaMock.resource.findUnique.mockResolvedValue(null as any);
      await expect(service.adminCreateReservation(base)).rejects.toThrow('RESOURCE_NOT_FOUND');
    });

    it('lève CLUB_MISMATCH si la ressource est d un autre club', async () => {
      prismaMock.resource.findUnique.mockResolvedValue({ clubId: 'autre', club: { timezone: 'Europe/Paris' } } as any);
      await expect(service.adminCreateReservation(base)).rejects.toThrow('CLUB_MISMATCH');
    });

    it('lève VALIDATION_ERROR si fin <= début', async () => {
      mockResource();
      await expect(service.adminCreateReservation({ ...base, startTime: '19:00', endTime: '18:00' })).rejects.toThrow('VALIDATION_ERROR');
    });

    it('lève SLOT_NOT_AVAILABLE si chevauchement', async () => {
      mockResource();
      prismaMock.$transaction.mockImplementation(async (cb: any) => cb(prismaMock));
      prismaMock.reservation.count.mockResolvedValue(1 as any);
      await expect(service.adminCreateReservation(base)).rejects.toThrow('SLOT_NOT_AVAILABLE');
      expect(prismaMock.reservation.create).not.toHaveBeenCalled();
    });

    it('lève VALIDATION_ERROR si le prix est négatif', async () => {
      mockResource();
      await expect(service.adminCreateReservation({ ...base, price: -5 })).rejects.toThrow('VALIDATION_ERROR');
    });

    it('lève VALIDATION_ERROR si début == fin', async () => {
      mockResource();
      await expect(service.adminCreateReservation({ ...base, startTime: '18:00', endTime: '18:00' })).rejects.toThrow('VALIDATION_ERROR');
    });
  });

  describe('listClubReservations', () => {
    it('filtre par club/ressource/statut et calcule le résumé (total dû / encaissé / reste)', async () => {
      prismaMock.reservation.findMany.mockResolvedValue([
        { id: 'r1', status: 'CONFIRMED', totalPrice: 25,   payments: [{ amount: 25 }] },
        { id: 'r2', status: 'PENDING',   totalPrice: 37.5, payments: [] },
        { id: 'r3', status: 'CANCELLED', totalPrice: 20,   payments: [{ amount: 20 }] },
      ] as any);

      const result = await service.listClubReservations({
        clubId: 'club-demo', resourceId: 'court-1', status: 'CONFIRMED',
      });

      expect(prismaMock.reservation.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({
          resource: { clubId: 'club-demo' }, resourceId: 'court-1', status: 'CONFIRMED',
        }),
      }));
      // Total dû exclut les annulées : 25 + 37.5 = 62.50
      expect(result.summary.total).toBe('62.50');
      // Encaissé = somme des paiements des non-annulées : 25 (r1)
      expect(result.summary.paid).toBe('25.00');
      expect(result.summary.outstanding).toBe('37.50');
      // paidAmount par réservation
      expect(result.reservations[0].paidAmount).toBe('25.00');
    });

    it('applique le filtre de jour quand date est fournie', async () => {
      prismaMock.reservation.findMany.mockResolvedValue([] as any);

      await service.listClubReservations({ clubId: 'club-demo', date: '2026-06-01' });

      const arg = (prismaMock.reservation.findMany as jest.Mock).mock.calls[0][0];
      expect(arg.where.startTime).toBeDefined();
      expect(arg.where.endTime).toBeDefined();
    });
  });
});
