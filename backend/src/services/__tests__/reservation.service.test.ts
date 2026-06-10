import '../../__mocks__/prisma';
import '../../__mocks__/redis';
import { DateTime } from 'luxon';
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

    it('applique le tarif heures creuses au total (créneau hors plage pleine)', async () => {
      redisMock.set.mockResolvedValue('OK');
      prismaMock.reservation.count.mockResolvedValue(0);
      // 2025-06-15 = dimanche, 10h Paris (08:00Z) ; pleines 18h–22h → ce créneau est creux.
      prismaMock.resource.findUniqueOrThrow.mockResolvedValue({
        pricePerHour: 25, offPeakPricePerHour: 18, clubId: 'club-demo',
        club: { timezone: 'Europe/Paris', peakHours: { 7: { start: 18, end: 22 } }, publicBookingDays: 7, memberBookingDays: 14 },
      } as any);
      prismaMock.clubMembership.findUnique.mockResolvedValue({ status: 'ACTIVE', isSubscriber: false } as any);
      prismaMock.reservation.create.mockResolvedValue({ id: 'res-1', ...baseParams, status: 'PENDING', totalPrice: 18, createdAt: new Date() } as any);

      await service.holdSlot(baseParams);

      const arg = (prismaMock.reservation.create as jest.Mock).mock.calls[0][0];
      expect(Number(arg.data.totalPrice)).toBe(18); // 18€/h × 1h
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

  describe('rescheduleReservation', () => {
    const tz = 'Europe/Paris';
    // Instant UTC correspondant à `hour` heure locale Paris, dans `daysAhead` jours.
    const futureLocal = (daysAhead: number, hour: number) =>
      DateTime.now().setZone(tz).plus({ days: daysAhead }).startOf('day').set({ hour }).toUTC().toJSDate();

    const oldStart = () => futureLocal(2, 18);
    const oldEnd   = () => futureLocal(2, 19);

    const mockOldReservation = (overrides: Record<string, unknown> = {}) =>
      prismaMock.reservation.findUnique.mockResolvedValue({
        id: 'res-old', resourceId: 'court-1', userId: 'user-1', status: 'CONFIRMED',
        startTime: oldStart(), endTime: oldEnd(),
        resource: { clubId: 'club-demo' },
        ...overrides,
      } as any);

    const mockTargetResource = (overrides: Record<string, unknown> = {}) =>
      prismaMock.resource.findUnique.mockResolvedValue({
        clubId: 'club-demo', openHour: 8, closeHour: 22,
        pricePerHour: 25, offPeakPricePerHour: null,
        club: { timezone: tz, peakHours: null, publicBookingDays: 7, memberBookingDays: 14 },
        ...overrides,
      } as any);

    const mockHappyTransaction = () => {
      prismaMock.$transaction.mockImplementation(async (cb: any) => cb(prismaMock));
      (prismaMock.$queryRaw as jest.Mock).mockResolvedValue([{ id: 'res-old', status: 'CONFIRMED' }]);
      prismaMock.reservation.count.mockResolvedValue(0 as any);
      prismaMock.reservation.create.mockResolvedValue({
        id: 'res-new', resourceId: 'court-1', userId: 'user-1', status: 'CONFIRMED',
        startTime: futureLocal(3, 10), endTime: new Date(futureLocal(3, 10).getTime() + 90 * 60_000),
      } as any);
      prismaMock.reservation.update.mockResolvedValue({ id: 'res-old', status: 'CANCELLED' } as any);
    };

    const params = () => ({ resourceId: 'court-1', startTime: futureLocal(3, 10), duration: 90 });

    it('déplace : crée la nouvelle CONFIRMED, annule l ancienne, nettoie les locks, broadcast released + confirmed', async () => {
      mockOldReservation();
      mockTargetResource();
      prismaMock.clubMembership.findUnique.mockResolvedValue({ status: 'ACTIVE', isSubscriber: false } as any);
      redisMock.set.mockResolvedValue('OK');
      mockHappyTransaction();

      const result = await service.rescheduleReservation('res-old', 'user-1', params());

      expect(prismaMock.reservation.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          resourceId: 'court-1', userId: 'user-1', status: 'CONFIRMED',
          startTime: params().startTime,
        }),
      }));
      expect(prismaMock.reservation.update).toHaveBeenCalledWith({
        where: { id: 'res-old' },
        data: { status: 'CANCELLED', cancelledAt: expect.any(Date) },
      });
      // lock de l'ancien créneau ET lock du nouveau créneau supprimés
      expect(redisMock.del).toHaveBeenCalledWith(`lock:resource:court-1:${oldStart().toISOString()}`);
      expect(redisMock.del).toHaveBeenCalledWith(`lock:resource:court-1:${params().startTime.toISOString()}`);
      expect(sseBroadcast()).toHaveBeenCalledWith('court-1',
        expect.objectContaining({ type: 'slot_released', reservationId: 'res-old' }));
      expect(sseBroadcast()).toHaveBeenCalledWith('court-1',
        expect.objectContaining({ type: 'slot_confirmed', reservationId: 'res-new' }));
      expect(result.id).toBe('res-new');
    });

    it('exclut sa propre réservation du comptage de conflits (déplacement chevauchant l ancien créneau)', async () => {
      mockOldReservation();
      mockTargetResource();
      prismaMock.clubMembership.findUnique.mockResolvedValue({ status: 'ACTIVE', isSubscriber: false } as any);
      redisMock.set.mockResolvedValue('OK');
      mockHappyTransaction();

      // Décalage de 30 min sur le même terrain : chevauche l'ancienne résa.
      await service.rescheduleReservation('res-old', 'user-1', {
        resourceId: 'court-1', startTime: new Date(oldStart().getTime() + 30 * 60_000), duration: 60,
      });

      const countArg = (prismaMock.reservation.count as jest.Mock).mock.calls[0][0];
      expect(countArg.where.id).toEqual({ not: 'res-old' });
    });

    it('lève SLOT_NOT_AVAILABLE si conflit : ancienne intacte + lock du nouveau créneau nettoyé', async () => {
      mockOldReservation();
      mockTargetResource();
      prismaMock.clubMembership.findUnique.mockResolvedValue({ status: 'ACTIVE', isSubscriber: false } as any);
      redisMock.set.mockResolvedValue('OK');
      prismaMock.$transaction.mockImplementation(async (cb: any) => cb(prismaMock));
      (prismaMock.$queryRaw as jest.Mock).mockResolvedValue([{ id: 'res-old', status: 'CONFIRMED' }]);
      prismaMock.reservation.count.mockResolvedValue(1 as any);

      await expect(service.rescheduleReservation('res-old', 'user-1', params()))
        .rejects.toThrow('SLOT_NOT_AVAILABLE');
      expect(prismaMock.reservation.update).not.toHaveBeenCalled();
      expect(redisMock.del).toHaveBeenCalledWith(`lock:resource:court-1:${params().startTime.toISOString()}`);
      expect(sseBroadcast()).not.toHaveBeenCalled();
    });

    it('lève SLOT_ALREADY_HELD si le lock Redis du nouveau créneau est pris', async () => {
      mockOldReservation();
      mockTargetResource();
      prismaMock.clubMembership.findUnique.mockResolvedValue({ status: 'ACTIVE', isSubscriber: false } as any);
      redisMock.set.mockResolvedValue(null);

      await expect(service.rescheduleReservation('res-old', 'user-1', params()))
        .rejects.toThrow('SLOT_ALREADY_HELD');
      expect(prismaMock.reservation.create).not.toHaveBeenCalled();
      expect(prismaMock.reservation.update).not.toHaveBeenCalled();
    });

    it('ne pose pas de lock Redis quand seul la durée change (même clé que l ancienne résa)', async () => {
      mockOldReservation();
      mockTargetResource();
      prismaMock.clubMembership.findUnique.mockResolvedValue({ status: 'ACTIVE', isSubscriber: false } as any);
      mockHappyTransaction();

      // Même terrain, même départ, durée 60 → 90 : la clé de lock est identique.
      await service.rescheduleReservation('res-old', 'user-1', {
        resourceId: 'court-1', startTime: oldStart(), duration: 90,
      });

      expect(redisMock.set).not.toHaveBeenCalled();
      expect(prismaMock.reservation.create).toHaveBeenCalled();
    });

    it('lève RESERVATION_NOT_FOUND si la réservation n existe pas', async () => {
      prismaMock.reservation.findUnique.mockResolvedValue(null);
      await expect(service.rescheduleReservation('res-x', 'user-1', params()))
        .rejects.toThrow('RESERVATION_NOT_FOUND');
    });

    it('lève UNAUTHORIZED si la résa appartient à un autre user', async () => {
      mockOldReservation({ userId: 'user-other' });
      await expect(service.rescheduleReservation('res-old', 'user-1', params()))
        .rejects.toThrow('UNAUTHORIZED');
    });

    it('lève RESERVATION_NOT_ACTIVE si la résa est annulée', async () => {
      mockOldReservation({ status: 'CANCELLED' });
      await expect(service.rescheduleReservation('res-old', 'user-1', params()))
        .rejects.toThrow('RESERVATION_NOT_ACTIVE');
    });

    it('lève RESERVATION_IN_PAST si la résa a déjà commencé', async () => {
      mockOldReservation({
        startTime: new Date(Date.now() - 3_600_000),
        endTime:   new Date(Date.now() - 1_800_000),
      });
      await expect(service.rescheduleReservation('res-old', 'user-1', params()))
        .rejects.toThrow('RESERVATION_IN_PAST');
    });

    it('lève VALIDATION_ERROR si la durée n est pas un multiple de 30 positif', async () => {
      mockOldReservation();
      await expect(service.rescheduleReservation('res-old', 'user-1', { ...params(), duration: 45 }))
        .rejects.toThrow('VALIDATION_ERROR');
    });

    it('lève RESOURCE_NOT_FOUND si la ressource cible n existe pas', async () => {
      mockOldReservation();
      prismaMock.resource.findUnique.mockResolvedValue(null as any);
      await expect(service.rescheduleReservation('res-old', 'user-1', params()))
        .rejects.toThrow('RESOURCE_NOT_FOUND');
    });

    it('lève CLUB_MISMATCH si la ressource cible est d un autre club', async () => {
      mockOldReservation();
      mockTargetResource({ clubId: 'autre-club' });
      await expect(service.rescheduleReservation('res-old', 'user-1', params()))
        .rejects.toThrow('CLUB_MISMATCH');
    });

    it('lève OUT_OF_HOURS si le nouveau créneau dépasse les heures d ouverture (heure locale)', async () => {
      mockOldReservation();
      mockTargetResource(); // closeHour 22
      await expect(service.rescheduleReservation('res-old', 'user-1', {
        resourceId: 'court-1', startTime: futureLocal(3, 21), duration: 120, // fin 23h locale
      })).rejects.toThrow('OUT_OF_HOURS');
      expect(redisMock.set).not.toHaveBeenCalled();
    });

    it('lève BOOKING_TOO_FAR au-delà de la fenêtre de réservation', async () => {
      mockOldReservation();
      mockTargetResource(); // publicBookingDays 7
      prismaMock.clubMembership.findUnique.mockResolvedValue(null as any);
      await expect(service.rescheduleReservation('res-old', 'user-1', {
        resourceId: 'court-1', startTime: futureLocal(30, 10), duration: 60,
      })).rejects.toThrow('BOOKING_TOO_FAR');
    });

    it('recalcule le prix avec le tarif heures creuses du nouveau créneau', async () => {
      mockOldReservation();
      const newStart = futureLocal(3, 10); // 10h locale
      const weekday = DateTime.fromJSDate(newStart).setZone(tz).weekday;
      // Heures pleines 18h–22h ce jour-là → 10h est creux.
      mockTargetResource({
        offPeakPricePerHour: 18,
        club: { timezone: tz, peakHours: { [weekday]: { start: 18, end: 22 } }, publicBookingDays: 7, memberBookingDays: 14 },
      });
      prismaMock.clubMembership.findUnique.mockResolvedValue({ status: 'ACTIVE', isSubscriber: false } as any);
      redisMock.set.mockResolvedValue('OK');
      mockHappyTransaction();

      await service.rescheduleReservation('res-old', 'user-1', { resourceId: 'court-1', startTime: newStart, duration: 90 });

      const arg = (prismaMock.reservation.create as jest.Mock).mock.calls[0][0];
      expect(Number(arg.data.totalPrice)).toBe(27); // 18 €/h × 1,5 h
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

  describe('confirmReservation avec paymentSource', () => {
    const pendingResa = () => ({
      id: 'res-1', userId: 'user-1', status: 'PENDING', createdAt: new Date(),
      resourceId: 'court-1', startTime: new Date(), endTime: new Date(),
      totalPrice: 25, resource: { clubId: 'club-demo' },
    });

    const mockHappyTx = () => {
      prismaMock.$transaction.mockImplementation(async (fn: any) => fn(prismaMock));
      (prismaMock.$queryRaw as jest.Mock)
        .mockResolvedValueOnce([{ id: 'res-1', status: 'PENDING', resource_id: 'court-1', start_time: new Date(), end_time: new Date() }])
        .mockResolvedValueOnce([{ count: 0n }]);
    };

    it('consomme le package et crée le paiement quand paymentSource est fourni', async () => {
      prismaMock.reservation.findUnique.mockResolvedValue(pendingResa() as any);
      mockHappyTx();
      prismaMock.memberPackage.findUnique.mockResolvedValue({ id: 'pkg-1', clubId: 'club-demo', userId: 'user-1', kind: 'ENTRIES' } as any);
      prismaMock.memberPackage.updateMany.mockResolvedValue({ count: 1 } as any);
      prismaMock.payment.create.mockResolvedValue({ id: 'pay-1' } as any);
      prismaMock.reservation.update.mockResolvedValue({
        id: 'res-1', resourceId: 'court-1', status: 'CONFIRMED',
        startTime: new Date(), endTime: new Date(),
      } as any);

      await service.confirmReservation('res-1', 'user-1', { packageId: 'pkg-1' });

      expect(prismaMock.memberPackage.updateMany).toHaveBeenCalled();
      expect(prismaMock.payment.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ method: 'PACK_CREDIT', sourcePackageId: 'pkg-1', reservationId: 'res-1' }),
      }));
    });

    it('solde insuffisant → INSUFFICIENT_BALANCE et la résa reste PENDING', async () => {
      prismaMock.reservation.findUnique.mockResolvedValue(pendingResa() as any);
      mockHappyTx();
      prismaMock.memberPackage.findUnique.mockResolvedValue({ id: 'pkg-1', clubId: 'club-demo', userId: 'user-1', kind: 'ENTRIES' } as any);
      prismaMock.memberPackage.updateMany.mockResolvedValue({ count: 0 } as any);

      await expect(service.confirmReservation('res-1', 'user-1', { packageId: 'pkg-1' }))
        .rejects.toThrow('INSUFFICIENT_BALANCE');
      expect(prismaMock.reservation.update).not.toHaveBeenCalled();
    });

    it('refuse le package d’un autre joueur ou d’un autre club', async () => {
      prismaMock.reservation.findUnique.mockResolvedValue(pendingResa() as any);
      mockHappyTx();
      prismaMock.memberPackage.findUnique.mockResolvedValue({ id: 'pkg-1', clubId: 'autre-club', userId: 'user-1', kind: 'ENTRIES' } as any);

      await expect(service.confirmReservation('res-1', 'user-1', { packageId: 'pkg-1' }))
        .rejects.toThrow('PACKAGE_NOT_FOUND');
    });
  });

  describe('addPayment étendu (caisse)', () => {
    const resa = { id: 'res-1', userId: 'user-1', resource: { clubId: 'club-1' } };

    beforeEach(() => {
      prismaMock.$transaction.mockImplementation(async (fn: any) => fn(prismaMock));
    });

    it('VOUCHER : exige une référence et pose voucherStatus PENDING_REIMBURSEMENT', async () => {
      prismaMock.reservation.findUnique.mockResolvedValue(resa as any);

      await expect(service.addPayment({ reservationId: 'res-1', clubId: 'club-1', amount: 25, method: 'VOUCHER' }))
        .rejects.toThrow('VALIDATION_ERROR');

      prismaMock.payment.create.mockResolvedValue({ id: 'pay-1' } as any);
      await service.addPayment({ reservationId: 'res-1', clubId: 'club-1', amount: 25, method: 'VOUCHER', voucherRef: 'ANCV-42', voucherIssuer: 'ANCV' });
      expect(prismaMock.payment.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ method: 'VOUCHER', voucherRef: 'ANCV-42', voucherStatus: 'PENDING_REIMBURSEMENT', clubId: 'club-1' }),
      }));
    });

    it('PACK_CREDIT : consomme 1 entrée et crée le paiement dans une transaction', async () => {
      prismaMock.reservation.findUnique.mockResolvedValue(resa as any);
      prismaMock.memberPackage.findUnique.mockResolvedValue({ id: 'pkg-1', clubId: 'club-1', userId: 'user-1', kind: 'ENTRIES' } as any);
      prismaMock.memberPackage.updateMany.mockResolvedValue({ count: 1 } as any);
      prismaMock.payment.create.mockResolvedValue({ id: 'pay-2' } as any);

      await service.addPayment({ reservationId: 'res-1', clubId: 'club-1', amount: 25, method: 'PACK_CREDIT', sourcePackageId: 'pkg-1' });

      expect(prismaMock.memberPackage.updateMany).toHaveBeenCalled();
      expect(prismaMock.payment.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ method: 'PACK_CREDIT', sourcePackageId: 'pkg-1' }),
      }));
    });

    it('WALLET : solde insuffisant → INSUFFICIENT_BALANCE, aucun paiement créé', async () => {
      prismaMock.reservation.findUnique.mockResolvedValue(resa as any);
      prismaMock.memberPackage.findUnique.mockResolvedValue({ id: 'pkg-2', clubId: 'club-1', userId: 'user-1', kind: 'WALLET' } as any);
      prismaMock.memberPackage.updateMany.mockResolvedValue({ count: 0 } as any);

      await expect(service.addPayment({ reservationId: 'res-1', clubId: 'club-1', amount: 25, method: 'WALLET', sourcePackageId: 'pkg-2' }))
        .rejects.toThrow('INSUFFICIENT_BALANCE');
      expect(prismaMock.payment.create).not.toHaveBeenCalled();
    });

    it('refuse un package d’un autre membre que celui de la résa', async () => {
      prismaMock.reservation.findUnique.mockResolvedValue(resa as any);
      prismaMock.memberPackage.findUnique.mockResolvedValue({ id: 'pkg-1', clubId: 'club-1', userId: 'autre-user', kind: 'ENTRIES' } as any);
      await expect(service.addPayment({ reservationId: 'res-1', clubId: 'club-1', amount: 25, method: 'PACK_CREDIT', sourcePackageId: 'pkg-1' }))
        .rejects.toThrow('PACKAGE_NOT_FOUND');
    });

    it('refuse PACK_CREDIT sur un porte-monnaie (kind mismatch)', async () => {
      prismaMock.reservation.findUnique.mockResolvedValue(resa as any);
      prismaMock.memberPackage.findUnique.mockResolvedValue({ id: 'pkg-2', clubId: 'club-1', userId: 'user-1', kind: 'WALLET' } as any);
      await expect(service.addPayment({ reservationId: 'res-1', clubId: 'club-1', amount: 25, method: 'PACK_CREDIT', sourcePackageId: 'pkg-2' }))
        .rejects.toThrow('VALIDATION_ERROR');
    });
  });
});
