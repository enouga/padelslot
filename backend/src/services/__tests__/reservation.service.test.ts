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

const mockNotifyPartners = jest.fn();
const mockNotifyAssigned = jest.fn();
jest.mock('../../email/notifications', () => ({
  notifyMatchPartnersInvited: (...a: unknown[]) => mockNotifyPartners(...a),
  notifyReservationMemberAssigned: (...a: unknown[]) => mockNotifyAssigned(...a),
}));

const sseBroadcast = () => mockBroadcast;

describe('ReservationService', () => {
  let service: ReservationService;

  beforeEach(() => {
    service = new ReservationService();
    mockBroadcast.mockReset();
    mockNotifyPartners.mockReset().mockResolvedValue(undefined);
    mockNotifyAssigned.mockReset().mockResolvedValue(undefined);
  });

  const baseParams = {
    resourceId: 'court-1',
    userId:     'user-1',
    startTime:  new Date('2025-06-15T08:00:00.000Z'),
    endTime:    new Date('2025-06-15T09:00:00.000Z'),
  };

  describe('holdSlot', () => {
    // holdSlot enveloppe désormais la création résa + participants dans une transaction.
    beforeEach(() => {
      prismaMock.$transaction.mockImplementation(async (cb: any) => cb(prismaMock));
      prismaMock.reservationParticipant.createMany.mockResolvedValue({ count: 1 } as any);
    });

    it('crée une PENDING reservation si le lock Redis est libre et le créneau disponible', async () => {
      redisMock.set.mockResolvedValue('OK');
      prismaMock.reservation.count.mockResolvedValue(0);
      prismaMock.resource.findUniqueOrThrow.mockResolvedValue({ price: 25, clubId: 'club-demo', club: { timezone: 'Europe/Paris', publicBookingDays: 7, memberBookingDays: 14 } } as any);
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
      prismaMock.resource.findUniqueOrThrow.mockResolvedValue({ price: 25, clubId: 'club-demo', club: { timezone: 'Europe/Paris', publicBookingDays: 7, memberBookingDays: 14 } } as any);
      prismaMock.reservation.count.mockResolvedValue(1);

      await expect(service.holdSlot(baseParams)).rejects.toThrow('SLOT_NOT_AVAILABLE');
      expect(redisMock.del).toHaveBeenCalledWith(
        expect.stringContaining('lock:resource:court-1:'),
      );
    });

    it('lève BOOKING_TOO_FAR si la date dépasse la fenêtre publique', async () => {
      redisMock.set.mockResolvedValue('OK');
      prismaMock.resource.findUniqueOrThrow.mockResolvedValue({ price: 25, clubId: 'club-demo', club: { timezone: 'Europe/Paris', publicBookingDays: 7, memberBookingDays: 14 } } as any);
      prismaMock.clubMembership.findUnique.mockResolvedValue(null as any);

      const far = new Date(Date.now() + 60 * 24 * 3600 * 1000); // +60 jours
      await expect(service.holdSlot({
        resourceId: 'court-1', userId: 'user-1', startTime: far, endTime: new Date(far.getTime() + 3_600_000),
      })).rejects.toThrow('BOOKING_TOO_FAR');
      expect(prismaMock.reservation.count).not.toHaveBeenCalled();
    });

    it('lève MEMBERSHIP_BLOCKED si le membre est bloqué par le club', async () => {
      redisMock.set.mockResolvedValue('OK');
      prismaMock.resource.findUniqueOrThrow.mockResolvedValue({ price: 25, clubId: 'club-demo', club: { timezone: 'Europe/Paris', publicBookingDays: 7, memberBookingDays: 14 } } as any);
      prismaMock.clubMembership.findUnique.mockResolvedValue({ status: 'BLOCKED', isSubscriber: false } as any);

      await expect(service.holdSlot(baseParams)).rejects.toThrow('MEMBERSHIP_BLOCKED');
      expect(prismaMock.reservation.count).not.toHaveBeenCalled();
      expect(prismaMock.clubMembership.create).not.toHaveBeenCalled();
    });

    it('crée une adhésion ACTIVE automatiquement au 1er créneau (membre absent)', async () => {
      redisMock.set.mockResolvedValue('OK');
      prismaMock.reservation.count.mockResolvedValue(0);
      prismaMock.resource.findUniqueOrThrow.mockResolvedValue({ price: 25, clubId: 'club-demo', club: { timezone: 'Europe/Paris', publicBookingDays: 7, memberBookingDays: 14 } } as any);
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
      prismaMock.resource.findUniqueOrThrow.mockResolvedValue({ price: 25, clubId: 'club-demo', club: { timezone: 'Europe/Paris', publicBookingDays: 7, memberBookingDays: 14 } } as any);
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
      // 2025-06-15 = dimanche, 10h Paris (08:00Z) ; creuses 8h–18h → ce créneau est creux.
      prismaMock.resource.findUniqueOrThrow.mockResolvedValue({
        price: 25, offPeakPrice: 18, clubId: 'club-demo',
        club: { timezone: 'Europe/Paris', offPeakHours: { 7: [{ start: 8, end: 18 }] }, publicBookingDays: 7, memberBookingDays: 14 },
      } as any);
      prismaMock.clubMembership.findUnique.mockResolvedValue({ status: 'ACTIVE', isSubscriber: false } as any);
      prismaMock.reservation.create.mockResolvedValue({ id: 'res-1', ...baseParams, status: 'PENDING', totalPrice: 18, createdAt: new Date() } as any);

      await service.holdSlot(baseParams);

      const arg = (prismaMock.reservation.create as jest.Mock).mock.calls[0][0];
      expect(Number(arg.data.totalPrice)).toBe(18); // prix du créneau creux
    });

    // --- Multi-joueurs : partenaires, visibilité, partage du montant ---

    const mockDoubleResource = (over: Record<string, unknown> = {}) =>
      prismaMock.resource.findUniqueOrThrow.mockResolvedValue({
        price: 25, clubId: 'club-demo', attributes: { format: 'double' },
        club: { timezone: 'Europe/Paris', publicBookingDays: 7, memberBookingDays: 14 },
        ...over,
      } as any);

    it('crée les lignes participant (organisateur + partenaire), parts égales, visibilité PUBLIC', async () => {
      redisMock.set.mockResolvedValue('OK');
      prismaMock.reservation.count.mockResolvedValue(0);
      mockDoubleResource();
      prismaMock.clubMembership.findUnique.mockResolvedValue({ status: 'ACTIVE', isSubscriber: false } as any);
      prismaMock.clubMembership.findMany.mockResolvedValue([{ userId: 'user-2' }] as any);
      prismaMock.reservation.create.mockResolvedValue({ id: 'res-1', ...baseParams, status: 'PENDING', totalPrice: 25, visibility: 'PUBLIC', createdAt: new Date() } as any);

      await service.holdSlot({ ...baseParams, partnerUserIds: ['user-2'], visibility: 'PUBLIC' });

      expect(prismaMock.reservation.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ status: 'PENDING', visibility: 'PUBLIC' }),
      }));
      const rows = (prismaMock.reservationParticipant.createMany as jest.Mock).mock.calls[0][0].data as any[];
      expect(rows).toHaveLength(2);
      const org = rows.find((r) => r.isOrganizer);
      const partner = rows.find((r) => !r.isOrganizer);
      expect(org.userId).toBe('user-1');
      expect(org.reservationId).toBe('res-1');
      expect(partner.userId).toBe('user-2');
      expect(Number(org.share)).toBe(12.5);
      expect(Number(partner.share)).toBe(12.5);
    });

    it('crée un seul participant organisateur (part = total) quand il n y a pas de partenaire', async () => {
      redisMock.set.mockResolvedValue('OK');
      prismaMock.reservation.count.mockResolvedValue(0);
      mockDoubleResource();
      prismaMock.clubMembership.findUnique.mockResolvedValue({ status: 'ACTIVE', isSubscriber: false } as any);
      prismaMock.reservation.create.mockResolvedValue({ id: 'res-1', ...baseParams, status: 'PENDING', totalPrice: 25, createdAt: new Date() } as any);

      await service.holdSlot(baseParams);

      const rows = (prismaMock.reservationParticipant.createMany as jest.Mock).mock.calls[0][0].data as any[];
      expect(rows).toHaveLength(1);
      expect(rows[0]).toEqual(expect.objectContaining({ userId: 'user-1', isOrganizer: true, reservationId: 'res-1' }));
      expect(Number(rows[0].share)).toBe(25);
      // sans partenaire on n'interroge pas l'annuaire des membres
      expect(prismaMock.clubMembership.findMany).not.toHaveBeenCalled();
    });

    it('répartit le reste au centime à l organisateur (3 joueurs, 25 € → 8.34 / 8.33 / 8.33)', async () => {
      redisMock.set.mockResolvedValue('OK');
      prismaMock.reservation.count.mockResolvedValue(0);
      mockDoubleResource();
      prismaMock.clubMembership.findUnique.mockResolvedValue({ status: 'ACTIVE', isSubscriber: false } as any);
      prismaMock.clubMembership.findMany.mockResolvedValue([{ userId: 'user-2' }, { userId: 'user-3' }] as any);
      prismaMock.reservation.create.mockResolvedValue({ id: 'res-1', ...baseParams, status: 'PENDING', totalPrice: 25, createdAt: new Date() } as any);

      await service.holdSlot({ ...baseParams, partnerUserIds: ['user-2', 'user-3'] });

      const rows = (prismaMock.reservationParticipant.createMany as jest.Mock).mock.calls[0][0].data as any[];
      const org = rows.find((r) => r.isOrganizer);
      const partners = rows.filter((r) => !r.isOrganizer);
      expect(Number(org.share)).toBe(8.34);
      expect(partners.map((p) => Number(p.share))).toEqual([8.33, 8.33]);
      // somme des parts == total
      expect(rows.reduce((s, r) => s + Number(r.share), 0)).toBeCloseTo(25, 2);
    });

    it('lève TOO_MANY_PLAYERS sur un terrain single (max 2 joueurs) et relâche le lock', async () => {
      redisMock.set.mockResolvedValue('OK');
      prismaMock.reservation.count.mockResolvedValue(0);
      mockDoubleResource({ attributes: { format: 'single' } });
      prismaMock.clubMembership.findUnique.mockResolvedValue({ status: 'ACTIVE', isSubscriber: false } as any);

      await expect(service.holdSlot({ ...baseParams, partnerUserIds: ['user-2', 'user-3'] }))
        .rejects.toThrow('TOO_MANY_PLAYERS');
      expect(redisMock.del).toHaveBeenCalled();
      expect(prismaMock.reservation.create).not.toHaveBeenCalled();
    });

    it('lève TOO_MANY_PLAYERS au-delà de 4 joueurs sur un double', async () => {
      redisMock.set.mockResolvedValue('OK');
      prismaMock.reservation.count.mockResolvedValue(0);
      mockDoubleResource();
      prismaMock.clubMembership.findUnique.mockResolvedValue({ status: 'ACTIVE', isSubscriber: false } as any);

      await expect(service.holdSlot({ ...baseParams, partnerUserIds: ['user-2', 'user-3', 'user-4', 'user-5'] }))
        .rejects.toThrow('TOO_MANY_PLAYERS');
      expect(prismaMock.reservation.create).not.toHaveBeenCalled();
    });

    it('lève PARTNER_NOT_MEMBER si un partenaire n est pas membre actif du club', async () => {
      redisMock.set.mockResolvedValue('OK');
      prismaMock.reservation.count.mockResolvedValue(0);
      mockDoubleResource();
      prismaMock.clubMembership.findUnique.mockResolvedValue({ status: 'ACTIVE', isSubscriber: false } as any);
      prismaMock.clubMembership.findMany.mockResolvedValue([{ userId: 'user-2' }] as any); // user-3 absent

      await expect(service.holdSlot({ ...baseParams, partnerUserIds: ['user-2', 'user-3'] }))
        .rejects.toThrow('PARTNER_NOT_MEMBER');
      expect(prismaMock.reservation.create).not.toHaveBeenCalled();
    });

    it('lève PARTNER_DUPLICATE si l organisateur ou un doublon figure dans les partenaires', async () => {
      redisMock.set.mockResolvedValue('OK');
      prismaMock.reservation.count.mockResolvedValue(0);
      mockDoubleResource();
      prismaMock.clubMembership.findUnique.mockResolvedValue({ status: 'ACTIVE', isSubscriber: false } as any);

      await expect(service.holdSlot({ ...baseParams, partnerUserIds: ['user-1'] }))
        .rejects.toThrow('PARTNER_DUPLICATE');
      await expect(service.holdSlot({ ...baseParams, partnerUserIds: ['user-2', 'user-2'] }))
        .rejects.toThrow('PARTNER_DUPLICATE');
      expect(prismaMock.reservation.create).not.toHaveBeenCalled();
    });
  });

  describe('cancelReservation', () => {
    it('annule une réservation CONFIRMED et broadcast slot_released', async () => {
      const future = new Date(Date.now() + 3_600_000);
      prismaMock.reservation.findUnique.mockResolvedValue({
        id: 'res-1', resourceId: 'court-1', userId: 'user-1', status: 'CONFIRMED',
        startTime: future, endTime: new Date(future.getTime() + 3_600_000),
        resource: { club: { cancellationCutoffHours: 0 } },
      } as any);
      prismaMock.reservation.update.mockResolvedValue({
        id: 'res-1', status: 'CANCELLED', resourceId: 'court-1',
        startTime: future, endTime: new Date(future.getTime() + 3_600_000),
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

    it('lève CANCELLATION_TOO_LATE après le délai du club', async () => {
      prismaMock.reservation.findUnique.mockResolvedValue({
        id: 'res-1', resourceId: 'court-1', userId: 'user-1', status: 'CONFIRMED',
        startTime: new Date(Date.now() + 3_600_000),       // début dans 1h
        endTime:   new Date(Date.now() + 7_200_000),
        resource: { club: { cancellationCutoffHours: 2 } }, // clôture 2h avant → déjà fermé
      } as any);

      await expect(service.cancelReservation('res-1', 'user-1')).rejects.toThrow('CANCELLATION_TOO_LATE');
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

  describe('quotas de réservation (holdSlot)', () => {
    const tz = 'Europe/Paris';
    // Créneau à venir : J+2 à 10h locale (durée 1h) — dans la fenêtre de résa.
    const futureSlot = (plusDays = 2, hour = 10, minutes = 60) => {
      const start = DateTime.now().setZone(tz).plus({ days: plusDays }).set({ hour, minute: 0, second: 0, millisecond: 0 });
      return { startTime: start.toJSDate(), endTime: start.plus({ minutes }).toJSDate() };
    };
    const mockClub = (bookingQuotas: unknown, offPeakHours: unknown = null) => {
      prismaMock.resource.findUniqueOrThrow.mockResolvedValue({
        price: 25, offPeakPrice: 18, clubId: 'club-demo',
        club: { timezone: tz, offPeakHours, publicBookingDays: 30, memberBookingDays: 60, bookingQuotas },
      } as any);
    };
    const QUOTAS = { model: 'UPCOMING', subscriber: { peak: 3, offPeak: null }, nonSubscriber: { peak: 1, offPeak: null } };

    beforeEach(() => {
      redisMock.set.mockResolvedValue('OK');
      prismaMock.$transaction.mockImplementation(async (cb: any) => cb(prismaMock));
      prismaMock.reservationParticipant.createMany.mockResolvedValue({ count: 1 } as any);
      prismaMock.reservation.count.mockResolvedValue(0);
      prismaMock.reservation.create.mockResolvedValue({ id: 'res-q', status: 'PENDING', ...futureSlot(), resourceId: 'court-1', createdAt: new Date() } as any);
      prismaMock.clubMembership.findUnique.mockResolvedValue({ status: 'ACTIVE', isSubscriber: false } as any);
    });

    it('UPCOMING : non-abonné à la limite pleine → QUOTA_PEAK_REACHED et lock relâché', async () => {
      mockClub(QUOTAS);
      prismaMock.reservation.findMany.mockResolvedValue([futureSlot(3)] as any); // 1 résa pleine à venir

      await expect(service.holdSlot({ resourceId: 'court-1', userId: 'user-1', ...futureSlot() }))
        .rejects.toThrow('QUOTA_PEAK_REACHED');
      expect(redisMock.del).toHaveBeenCalled();
      expect(prismaMock.reservation.create).not.toHaveBeenCalled();
    });

    it('UPCOMING : l abonné a son propre jeu de limites (3 pleines)', async () => {
      mockClub(QUOTAS);
      prismaMock.clubMembership.findUnique.mockResolvedValue({ status: 'ACTIVE', isSubscriber: true } as any);
      prismaMock.reservation.findMany.mockResolvedValue([futureSlot(3), futureSlot(4)] as any); // 2 < 3

      await service.holdSlot({ resourceId: 'court-1', userId: 'user-1', ...futureSlot() });
      expect(prismaMock.reservation.create).toHaveBeenCalled();
    });

    it('limite 0 → bloqué sans même compter', async () => {
      mockClub({ ...QUOTAS, nonSubscriber: { peak: 0, offPeak: null } });

      await expect(service.holdSlot({ resourceId: 'court-1', userId: 'user-1', ...futureSlot() }))
        .rejects.toThrow('QUOTA_PEAK_REACHED');
      expect(prismaMock.reservation.findMany).not.toHaveBeenCalled();
    });

    it('limite null = illimité : pas de comptage pour la classe creuse', async () => {
      // Tout le jour du créneau en creuses → classe OFF_PEAK, limite offPeak null.
      const wd = DateTime.now().setZone(tz).plus({ days: 2 }).weekday;
      mockClub(QUOTAS, { [wd]: [{ start: 0, end: 24 }] });

      await service.holdSlot({ resourceId: 'court-1', userId: 'user-1', ...futureSlot() });
      expect(prismaMock.reservation.findMany).not.toHaveBeenCalled();
      expect(prismaMock.reservation.create).toHaveBeenCalled();
    });

    it('seules les résas de la même classe comptent (une creuse ne consomme pas le quota plein)', async () => {
      // Créneau demandé J+2 (tout plein) ; résa existante J+3 entièrement creuse.
      const wd3 = DateTime.now().setZone(tz).plus({ days: 3 }).weekday;
      mockClub({ ...QUOTAS, nonSubscriber: { peak: 1, offPeak: null } }, { [wd3]: [{ start: 0, end: 24 }] });
      prismaMock.reservation.findMany.mockResolvedValue([futureSlot(3)] as any); // creuse → ne compte pas

      await service.holdSlot({ resourceId: 'court-1', userId: 'user-1', ...futureSlot(2) });
      expect(prismaMock.reservation.create).toHaveBeenCalled();
    });

    it('WEEKLY : fenêtre = semaine calendaire lun-dim du créneau, fuseau club', async () => {
      mockClub({ ...QUOTAS, model: 'WEEKLY' });
      prismaMock.reservation.findMany.mockResolvedValue([] as any);
      const slot = futureSlot(2);

      await service.holdSlot({ resourceId: 'court-1', userId: 'user-1', ...slot });

      const arg = (prismaMock.reservation.findMany as jest.Mock).mock.calls[0][0];
      const weekStart = DateTime.fromJSDate(slot.startTime).setZone(tz).startOf('week');
      expect(arg.where.startTime.gte).toEqual(weekStart.toJSDate());
      expect(arg.where.startTime.lt).toEqual(weekStart.plus({ days: 7 }).toJSDate());
      expect(arg.where.type).toBe('COURT');
      expect(arg.where.resource).toEqual({ clubId: 'club-demo' });
    });

    it('pas de quotas configurés → aucun comptage', async () => {
      mockClub(null);
      await service.holdSlot({ resourceId: 'court-1', userId: 'user-1', ...futureSlot() });
      expect(prismaMock.reservation.findMany).not.toHaveBeenCalled();
    });
  });

  describe('listClubReservations', () => {
    beforeEach(() => {
      prismaMock.club.findUniqueOrThrow.mockResolvedValue({ timezone: 'Europe/Paris', offPeakHours: null } as any);
    });

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

    it('expose la part payée / le reste dû par participant', async () => {
      prismaMock.reservation.findMany.mockResolvedValue([
        {
          id: 'r1', status: 'CONFIRMED', type: 'COURT', totalPrice: 24,
          startTime: new Date('2026-06-11T14:00:00Z'), endTime: new Date('2026-06-11T15:00:00Z'),
          resource: { id: 'c1', name: 'T1', price: 24, offPeakPrice: null },
          participants: [
            { id: 'pp1', userId: 'u1', share: '12', user: { firstName: 'A', lastName: 'B' } },
            { id: 'pp2', userId: 'u2', share: '12', user: { firstName: 'C', lastName: 'D' } },
          ],
          payments: [
            { id: 'x1', amount: 12, participantId: 'pp1' },
            { id: 'x2', amount: 5, participantId: 'pp2' },
          ],
        },
      ] as any);

      const result = await service.listClubReservations({ clubId: 'club-demo' });

      const parts = result.reservations[0].participants;
      expect(parts).toHaveLength(2);
      expect(parts.find((p: any) => p.id === 'pp1')).toEqual(expect.objectContaining({ paid: '12.00', outstanding: '0.00' }));
      expect(parts.find((p: any) => p.id === 'pp2')).toEqual(expect.objectContaining({ paid: '5.00', outstanding: '7.00' }));
    });

    it('dueAmount : repli tarif terrain pour une COURT sans prix, outstanding clampé par résa', async () => {
      // Jeudi 11/06/2026, creuses 8h-17h → 16h-17h locale est creuse (créneau à 30 €).
      prismaMock.club.findUniqueOrThrow.mockResolvedValue({
        timezone: 'Europe/Paris', offPeakHours: { 4: [{ start: 8, end: 17 }] },
      } as any);
      const res = { id: 'c1', name: 'T1', price: 52, offPeakPrice: 30 };
      prismaMock.reservation.findMany.mockResolvedValue([
        { id: 'r1', status: 'CONFIRMED', type: 'COURT', totalPrice: 0,
          startTime: new Date('2026-06-11T14:00:00Z'), endTime: new Date('2026-06-11T15:00:00Z'),
          resource: res, payments: [] },
        // surpayée (due 25, payé 30) : ne doit pas masquer le dû de r1
        { id: 'r2', status: 'CONFIRMED', type: 'COURT', totalPrice: 25,
          startTime: new Date('2026-06-11T16:00:00Z'), endTime: new Date('2026-06-11T17:00:00Z'),
          resource: res, payments: [{ amount: 30 }] },
        { id: 'r3', status: 'CONFIRMED', type: 'EVENT', totalPrice: 0,
          startTime: new Date('2026-06-11T16:00:00Z'), endTime: new Date('2026-06-11T18:00:00Z'),
          resource: res, payments: [] },
      ] as any);

      const result = await service.listClubReservations({ clubId: 'club-demo' });

      expect(result.reservations[0].dueAmount).toBe('30.00'); // tarif creux 1h
      expect(result.reservations[2].dueAmount).toBe('0.00');  // EVENT libre
      expect(result.summary.total).toBe('55.00');             // 30 + 25 + 0
      expect(result.summary.paid).toBe('30.00');
      expect(result.summary.outstanding).toBe('30.00');       // max(0,30-0) + max(0,25-30) + 0
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

    it('attribue le paiement par carnet au participant organisateur', async () => {
      prismaMock.reservation.findUnique.mockResolvedValue(pendingResa() as any);
      mockHappyTx();
      prismaMock.reservationParticipant.findFirst.mockResolvedValue({ id: 'org-p' } as any);
      prismaMock.memberPackage.findUnique.mockResolvedValue({ id: 'pkg-1', clubId: 'club-demo', userId: 'user-1', kind: 'ENTRIES' } as any);
      prismaMock.memberPackage.updateMany.mockResolvedValue({ count: 1 } as any);
      prismaMock.payment.create.mockResolvedValue({ id: 'pay-1' } as any);
      prismaMock.reservation.update.mockResolvedValue({ id: 'res-1', resourceId: 'court-1', status: 'CONFIRMED', startTime: new Date(), endTime: new Date() } as any);

      await service.confirmReservation('res-1', 'user-1', { packageId: 'pkg-1' });

      expect(prismaMock.payment.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ participantId: 'org-p', sourcePackageId: 'pkg-1' }),
      }));
    });

    it('notifie les partenaires après la confirmation (best-effort)', async () => {
      prismaMock.reservation.findUnique.mockResolvedValue(pendingResa() as any);
      mockHappyTx();
      prismaMock.reservation.update.mockResolvedValue({ id: 'res-1', resourceId: 'court-1', status: 'CONFIRMED', startTime: new Date(), endTime: new Date() } as any);

      await service.confirmReservation('res-1', 'user-1');

      expect(mockNotifyPartners).toHaveBeenCalledWith('res-1');
    });

    it('un échec de notification ne fait pas échouer la confirmation', async () => {
      prismaMock.reservation.findUnique.mockResolvedValue(pendingResa() as any);
      mockHappyTx();
      prismaMock.reservation.update.mockResolvedValue({ id: 'res-1', resourceId: 'court-1', status: 'CONFIRMED', startTime: new Date(), endTime: new Date() } as any);
      mockNotifyPartners.mockRejectedValue(new Error('SMTP down'));

      const r = await service.confirmReservation('res-1', 'user-1');
      expect(r.status).toBe('CONFIRMED');
    });
  });

  describe('addPayment étendu (caisse)', () => {
    const resa = { id: 'res-1', userId: 'user-1', resource: { clubId: 'club-1' } };
    // Résa avec prix et contexte tarifaire complet (jeudi 11/06/2026, 16h-17h à Paris).
    const pricedResa = (over: Record<string, unknown> = {}) => ({
      id: 'res-1', userId: 'user-1', type: 'COURT', totalPrice: '52',
      startTime: new Date('2026-06-11T14:00:00Z'), endTime: new Date('2026-06-11T15:00:00Z'),
      resource: {
        clubId: 'club-1', price: '52', offPeakPrice: null,
        club: { offPeakHours: null, timezone: 'Europe/Paris' },
      },
      ...over,
    });
    const paidSoFar = (amount: number) =>
      prismaMock.payment.aggregate.mockResolvedValue({ _sum: { amount } } as any);

    beforeEach(() => {
      prismaMock.$transaction.mockImplementation(async (fn: any) => fn(prismaMock));
      paidSoFar(0);
    });

    it('VOUCHER : référence optionnelle, pose voucherStatus PENDING_REIMBURSEMENT', async () => {
      prismaMock.reservation.findUnique.mockResolvedValue(resa as any);
      prismaMock.payment.create.mockResolvedValue({ id: 'pay-0' } as any);

      await service.addPayment({ reservationId: 'res-1', clubId: 'club-1', amount: 25, method: 'VOUCHER' });
      expect(prismaMock.payment.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ method: 'VOUCHER', voucherRef: null, voucherStatus: 'PENDING_REIMBURSEMENT' }),
      }));

      prismaMock.payment.create.mockClear();
      await service.addPayment({ reservationId: 'res-1', clubId: 'club-1', amount: 25, method: 'VOUCHER', voucherRef: 'ANCV-42', voucherIssuer: 'ANCV' });
      expect(prismaMock.payment.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ method: 'VOUCHER', voucherRef: 'ANCV-42', voucherStatus: 'PENDING_REIMBURSEMENT', clubId: 'club-1' }),
      }));
    });

    it('MEMBER : enregistre un encaissement couvert par l’abonnement', async () => {
      prismaMock.reservation.findUnique.mockResolvedValue(pricedResa() as any);
      prismaMock.payment.create.mockResolvedValue({ id: 'pay-m' } as any);

      await service.addPayment({ reservationId: 'res-1', clubId: 'club-1', amount: 52, method: 'MEMBER' });
      expect(prismaMock.payment.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ method: 'MEMBER' }),
      }));
    });

    it('refuse un encaissement qui dépasse le prix de la résa', async () => {
      prismaMock.reservation.findUnique.mockResolvedValue(pricedResa() as any);
      paidSoFar(39);

      await expect(service.addPayment({ reservationId: 'res-1', clubId: 'club-1', amount: 26, method: 'CASH' }))
        .rejects.toThrow('PAYMENT_EXCEEDS_DUE');
      expect(prismaMock.payment.create).not.toHaveBeenCalled();
    });

    it('accepte un encaissement qui complète exactement le prix', async () => {
      prismaMock.reservation.findUnique.mockResolvedValue(pricedResa() as any);
      paidSoFar(39);
      prismaMock.payment.create.mockResolvedValue({ id: 'pay-3' } as any);

      await service.addPayment({ reservationId: 'res-1', clubId: 'club-1', amount: 13, method: 'CASH' });
      expect(prismaMock.payment.create).toHaveBeenCalled();
    });

    it('résa COURT sans prix : plafond = tarif du terrain, heures creuses comprises', async () => {
      // Jeudi (weekday 4), 16h locale : heures creuses 8h–17h → créneau creux à 30 €.
      prismaMock.reservation.findUnique.mockResolvedValue(pricedResa({
        totalPrice: '0',
        resource: {
          clubId: 'club-1', price: '52', offPeakPrice: '30',
          club: { offPeakHours: { 4: [{ start: 8, end: 17 }] }, timezone: 'Europe/Paris' },
        },
      }) as any);

      await expect(service.addPayment({ reservationId: 'res-1', clubId: 'club-1', amount: 40, method: 'CASH' }))
        .rejects.toThrow('PAYMENT_EXCEEDS_DUE');

      prismaMock.payment.create.mockResolvedValue({ id: 'pay-4' } as any);
      await service.addPayment({ reservationId: 'res-1', clubId: 'club-1', amount: 30, method: 'CASH' });
      expect(prismaMock.payment.create).toHaveBeenCalled();
    });

    it('EVENT sans prix : pas de plafond', async () => {
      prismaMock.reservation.findUnique.mockResolvedValue(pricedResa({ type: 'EVENT', totalPrice: '0' }) as any);
      prismaMock.payment.create.mockResolvedValue({ id: 'pay-5' } as any);

      await service.addPayment({ reservationId: 'res-1', clubId: 'club-1', amount: 999, method: 'CASH' });
      expect(prismaMock.payment.create).toHaveBeenCalled();
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

  describe('addPayment par participant (Phase 3)', () => {
    const resa = { id: 'res-1', userId: 'user-1', resource: { clubId: 'club-1' } };
    const participant = (over: Record<string, unknown> = {}) =>
      prismaMock.reservationParticipant.findUnique.mockResolvedValue({ id: 'pp1', reservationId: 'res-1', userId: 'user-2', share: '12', ...over } as any);
    const paidByParticipant = (amount: number) =>
      prismaMock.payment.aggregate.mockResolvedValue({ _sum: { amount } } as any);

    beforeEach(() => {
      prismaMock.$transaction.mockImplementation(async (fn: any) => fn(prismaMock));
      prismaMock.reservation.findUnique.mockResolvedValue(resa as any);
      paidByParticipant(0);
    });

    it('attribue le paiement au participant et plafonne à SA part', async () => {
      participant();
      prismaMock.payment.create.mockResolvedValue({ id: 'pay-pp' } as any);

      await service.addPayment({ reservationId: 'res-1', clubId: 'club-1', amount: 12, method: 'CASH', participantId: 'pp1' });

      expect(prismaMock.payment.aggregate).toHaveBeenCalledWith(expect.objectContaining({ where: { participantId: 'pp1' } }));
      expect(prismaMock.payment.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ participantId: 'pp1', method: 'CASH' }),
      }));
    });

    it('refuse un encaissement qui dépasse la part du participant', async () => {
      participant({ share: '12' });
      paidByParticipant(10);
      await expect(service.addPayment({ reservationId: 'res-1', clubId: 'club-1', amount: 5, method: 'CASH', participantId: 'pp1' }))
        .rejects.toThrow('PAYMENT_EXCEEDS_DUE');
      expect(prismaMock.payment.create).not.toHaveBeenCalled();
    });

    it('lève PARTICIPANT_NOT_FOUND si le participant est d une autre résa', async () => {
      participant({ reservationId: 'autre-res' });
      await expect(service.addPayment({ reservationId: 'res-1', clubId: 'club-1', amount: 12, method: 'CASH', participantId: 'pp1' }))
        .rejects.toThrow('PARTICIPANT_NOT_FOUND');
    });

    it('carnet : le package doit appartenir à l utilisateur du participant', async () => {
      participant({ userId: 'user-2' });
      prismaMock.memberPackage.findUnique.mockResolvedValue({ id: 'pkg-1', clubId: 'club-1', userId: 'autre', kind: 'ENTRIES' } as any);
      await expect(service.addPayment({ reservationId: 'res-1', clubId: 'club-1', amount: 12, method: 'PACK_CREDIT', sourcePackageId: 'pkg-1', participantId: 'pp1' }))
        .rejects.toThrow('PACKAGE_NOT_FOUND');
    });
  });

  describe('assignReservationMember', () => {
    const resa = { id: 'res-1', resource: { clubId: 'club-1' } };

    it('affecte un membre actif à la résa', async () => {
      prismaMock.reservation.findUnique.mockResolvedValue({ ...resa, participants: [] } as any);
      prismaMock.clubMembership.findUnique.mockResolvedValue({ id: 'mb-1', status: 'ACTIVE' } as any);
      prismaMock.$transaction.mockImplementation(async (cb: any) => cb(prismaMock));
      prismaMock.reservation.update.mockResolvedValue({ id: 'res-1', userId: 'user-1' } as any);
      jest.spyOn(service as any, 'loadClubReservation').mockResolvedValue({ id: 'res-1' } as any);

      await service.assignReservationMember('res-1', 'club-1', 'user-1');

      expect(prismaMock.reservation.update).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: 'res-1' }, data: { userId: 'user-1' },
      }));
    });

    it('refuse un joueur non membre (MEMBER_NOT_FOUND)', async () => {
      prismaMock.reservation.findUnique.mockResolvedValue(resa as any);
      prismaMock.clubMembership.findUnique.mockResolvedValue(null as any);
      await expect(service.assignReservationMember('res-1', 'club-1', 'user-1')).rejects.toThrow('MEMBER_NOT_FOUND');
    });

    it('refuse un membre bloqué (MEMBER_NOT_FOUND)', async () => {
      prismaMock.reservation.findUnique.mockResolvedValue(resa as any);
      prismaMock.clubMembership.findUnique.mockResolvedValue({ id: 'mb-1', status: 'BLOCKED' } as any);
      await expect(service.assignReservationMember('res-1', 'club-1', 'user-1')).rejects.toThrow('MEMBER_NOT_FOUND');
    });

    it("refuse une résa d'un autre club (CLUB_MISMATCH)", async () => {
      prismaMock.reservation.findUnique.mockResolvedValue({ id: 'res-1', resource: { clubId: 'autre' } } as any);
      await expect(service.assignReservationMember('res-1', 'club-1', 'user-1')).rejects.toThrow('CLUB_MISMATCH');
    });

    it('refuse une résa inconnue (RESERVATION_NOT_FOUND)', async () => {
      prismaMock.reservation.findUnique.mockResolvedValue(null as any);
      await expect(service.assignReservationMember('res-1', 'club-1', 'user-1')).rejects.toThrow('RESERVATION_NOT_FOUND');
    });
  });

  describe('addReservationParticipant', () => {
    const resa = (over: any = {}) => ({
      id: 'res-1', userId: 'user-1', type: 'COURT', totalPrice: 25,
      startTime: new Date('2025-06-15T08:00:00.000Z'), endTime: new Date('2025-06-15T09:00:00.000Z'),
      resource: { clubId: 'club-1', attributes: { format: 'double' }, price: 25, offPeakPrice: null, club: { offPeakHours: null, timezone: 'Europe/Paris' } },
      ...over,
    });

    beforeEach(() => {
      prismaMock.$transaction.mockImplementation(async (cb: any) => cb(prismaMock));
      prismaMock.clubMembership.findUnique.mockResolvedValue({ id: 'mb-1', status: 'ACTIVE' } as any);
      jest.spyOn(service as any, 'loadClubReservation').mockResolvedValue({ id: 'res-1' } as any);
    });

    it("matérialise l'organisateur quand aucune ligne participant", async () => {
      prismaMock.reservation.findUnique.mockResolvedValue(resa() as any);
      prismaMock.reservationParticipant.findMany.mockResolvedValue([] as any);

      await service.addReservationParticipant('res-1', 'club-1', 'user-2');

      expect(prismaMock.reservationParticipant.createMany).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({ userId: 'user-1', isOrganizer: true }),
          expect.objectContaining({ userId: 'user-2', isOrganizer: false }),
        ]),
      }));
    });

    it('ajoute un 2e partenaire et recalcule les parts (25,00 / 3 → 8,34 / 8,33 / 8,33)', async () => {
      prismaMock.reservation.findUnique.mockResolvedValue(resa() as any);
      prismaMock.reservationParticipant.findMany.mockResolvedValue([
        { id: 'p1', userId: 'user-1', isOrganizer: true },
        { id: 'p2', userId: 'user-2', isOrganizer: false },
      ] as any);

      await service.addReservationParticipant('res-1', 'club-1', 'user-3');

      const u1 = prismaMock.reservationParticipant.update.mock.calls.map((c: any) => c[0]).find((u: any) => u.where.id === 'p1');
      expect(Number(u1.data.share)).toBeCloseTo(8.34, 2);
      const created = prismaMock.reservationParticipant.create.mock.calls[0][0] as any;
      expect(created.data.userId).toBe('user-3');
      expect(Number(created.data.share)).toBeCloseTo(8.33, 2);
    });

    it('no-op si le membre est déjà participant', async () => {
      prismaMock.reservation.findUnique.mockResolvedValue(resa() as any);
      prismaMock.reservationParticipant.findMany.mockResolvedValue([
        { id: 'p1', userId: 'user-1', isOrganizer: true },
        { id: 'p2', userId: 'user-2', isOrganizer: false },
      ] as any);

      await service.addReservationParticipant('res-1', 'club-1', 'user-2');

      expect(prismaMock.reservationParticipant.create).not.toHaveBeenCalled();
      expect(prismaMock.reservationParticipant.createMany).not.toHaveBeenCalled();
    });

    it('refuse au-delà de la capacité (TOO_MANY_PLAYERS, single)', async () => {
      prismaMock.reservation.findUnique.mockResolvedValue(resa({
        resource: { clubId: 'club-1', attributes: { format: 'single' }, price: 25, offPeakPrice: null, club: { offPeakHours: null, timezone: 'Europe/Paris' } },
      }) as any);
      prismaMock.reservationParticipant.findMany.mockResolvedValue([
        { id: 'p1', userId: 'user-1', isOrganizer: true },
        { id: 'p2', userId: 'user-2', isOrganizer: false },
      ] as any);
      await expect(service.addReservationParticipant('res-1', 'club-1', 'user-3')).rejects.toThrow('TOO_MANY_PLAYERS');
    });

    it('refuse un membre bloqué (MEMBER_NOT_FOUND)', async () => {
      prismaMock.reservation.findUnique.mockResolvedValue(resa() as any);
      prismaMock.clubMembership.findUnique.mockResolvedValue({ id: 'mb-1', status: 'BLOCKED' } as any);
      await expect(service.addReservationParticipant('res-1', 'club-1', 'user-3')).rejects.toThrow('MEMBER_NOT_FOUND');
    });

    it('refuse sans membre principal et sans participants (RESERVATION_HAS_NO_MEMBER)', async () => {
      prismaMock.reservation.findUnique.mockResolvedValue(resa({ userId: null }) as any);
      prismaMock.reservationParticipant.findMany.mockResolvedValue([] as any);
      await expect(service.addReservationParticipant('res-1', 'club-1', 'user-2')).rejects.toThrow('RESERVATION_HAS_NO_MEMBER');
    });

    it("refuse une résa d'un autre club (CLUB_MISMATCH)", async () => {
      prismaMock.reservation.findUnique.mockResolvedValue(resa({ resource: { clubId: 'autre' } }) as any);
      await expect(service.addReservationParticipant('res-1', 'club-1', 'user-2')).rejects.toThrow('CLUB_MISMATCH');
    });
  });

  describe('removeReservationParticipant', () => {
    const resa = (over: any = {}) => ({
      id: 'res-1', userId: 'user-1', type: 'COURT', totalPrice: 25,
      startTime: new Date('2025-06-15T08:00:00.000Z'), endTime: new Date('2025-06-15T09:00:00.000Z'),
      resource: { clubId: 'club-1', price: 25, offPeakPrice: null, club: { offPeakHours: null, timezone: 'Europe/Paris' } },
      ...over,
    });

    beforeEach(() => {
      prismaMock.$transaction.mockImplementation(async (cb: any) => cb(prismaMock));
      jest.spyOn(service as any, 'loadClubReservation').mockResolvedValue({ id: 'res-1' } as any);
    });

    it('retire un partenaire et recalcule les survivants (25,00 / 2 = 12,50)', async () => {
      prismaMock.reservation.findUnique.mockResolvedValue(resa() as any);
      prismaMock.reservationParticipant.findMany.mockResolvedValue([
        { id: 'p1', userId: 'user-1', isOrganizer: true },
        { id: 'p2', userId: 'user-2', isOrganizer: false },
        { id: 'p3', userId: 'user-3', isOrganizer: false },
      ] as any);

      await service.removeReservationParticipant('res-1', 'club-1', 'p3');

      expect(prismaMock.reservationParticipant.delete).toHaveBeenCalledWith({ where: { id: 'p3' } });
      const u1 = prismaMock.reservationParticipant.update.mock.calls.map((c: any) => c[0]).find((u: any) => u.where.id === 'p1');
      expect(Number(u1.data.share)).toBeCloseTo(12.5, 2);
    });

    it('conserve les paiements du joueur retiré (aucun payment.delete)', async () => {
      prismaMock.reservation.findUnique.mockResolvedValue(resa() as any);
      prismaMock.reservationParticipant.findMany.mockResolvedValue([
        { id: 'p1', userId: 'user-1', isOrganizer: true },
        { id: 'p2', userId: 'user-2', isOrganizer: false },
      ] as any);

      await service.removeReservationParticipant('res-1', 'club-1', 'p2');

      expect(prismaMock.reservationParticipant.delete).toHaveBeenCalledWith({ where: { id: 'p2' } });
      expect(prismaMock.payment.delete).not.toHaveBeenCalled();
    });

    it("refuse de retirer l'organisateur s'il reste d'autres joueurs (CANNOT_REMOVE_ORGANIZER)", async () => {
      prismaMock.reservation.findUnique.mockResolvedValue(resa() as any);
      prismaMock.reservationParticipant.findMany.mockResolvedValue([
        { id: 'p1', userId: 'user-1', isOrganizer: true },
        { id: 'p2', userId: 'user-2', isOrganizer: false },
      ] as any);
      await expect(service.removeReservationParticipant('res-1', 'club-1', 'p1')).rejects.toThrow('CANNOT_REMOVE_ORGANIZER');
    });

    it('descendre à 1 participant : il devient organisateur avec le dû complet', async () => {
      prismaMock.reservation.findUnique.mockResolvedValue(resa() as any);
      prismaMock.reservationParticipant.findMany.mockResolvedValue([
        { id: 'p1', userId: 'user-1', isOrganizer: true },
        { id: 'p2', userId: 'user-2', isOrganizer: false },
      ] as any);

      await service.removeReservationParticipant('res-1', 'club-1', 'p2');

      const u1 = prismaMock.reservationParticipant.update.mock.calls.map((c: any) => c[0]).find((u: any) => u.where.id === 'p1');
      expect(u1.data.isOrganizer).toBe(true);
      expect(Number(u1.data.share)).toBeCloseTo(25, 2);
    });

    it('refuse un participant inconnu (PARTICIPANT_NOT_FOUND)', async () => {
      prismaMock.reservation.findUnique.mockResolvedValue(resa() as any);
      prismaMock.reservationParticipant.findMany.mockResolvedValue([{ id: 'p1', userId: 'user-1', isOrganizer: true }] as any);
      await expect(service.removeReservationParticipant('res-1', 'club-1', 'pX')).rejects.toThrow('PARTICIPANT_NOT_FOUND');
    });

    it("refuse une résa d'un autre club (CLUB_MISMATCH)", async () => {
      prismaMock.reservation.findUnique.mockResolvedValue(resa({ resource: { clubId: 'autre' } }) as any);
      await expect(service.removeReservationParticipant('res-1', 'club-1', 'p1')).rejects.toThrow('CLUB_MISMATCH');
    });
  });
});
