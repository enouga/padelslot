import '../../__mocks__/prisma';
import { prismaMock } from '../../__mocks__/prisma';
import { AvailabilityService } from '../availability.service';

describe('AvailabilityService.getAvailableSlots', () => {
  let service: AvailabilityService;

  beforeEach(() => { service = new AvailabilityService(); });

  it('retourne tous les créneaux disponibles quand aucune réservation active', async () => {
    prismaMock.reservation.findMany.mockResolvedValue([]);
    prismaMock.court.findUniqueOrThrow.mockResolvedValue({
      openHour: 8,
      closeHour: 22,
    } as any);

    const slots = await service.getAvailableSlots('court-1', '2025-06-15', 60);

    // 8h -> 22h, step 30 min, duration 60 min → 27 créneaux (8:00, 8:30, ..., 21:00)
    // (22h - 8h = 14h = 840 min, dernière durée 60 min → (840-60)/30 + 1 = 27)
    expect(slots).toHaveLength(27);
    expect(slots.every((s) => s.available)).toBe(true);
  });

  it('marque comme indisponible le créneau qui chevauche une réservation CONFIRMED', async () => {
    prismaMock.court.findUniqueOrThrow.mockResolvedValue({
      openHour: 8,
      closeHour: 22,
    } as any);
    prismaMock.reservation.findMany.mockResolvedValue([
      {
        startTime: new Date('2025-06-15T07:00:00.000Z'), // 9h Paris (UTC+2)
        endTime:   new Date('2025-06-15T08:00:00.000Z'), // 10h Paris
        status:    'CONFIRMED',
      } as any,
    ]);

    const slots = await service.getAvailableSlots('court-1', '2025-06-15', 60);

    // 9h00-10h00 bloqué (07:00 UTC)
    const blocked = slots.find((s) => s.startTime === '2025-06-15T07:00:00.000Z');
    expect(blocked?.available).toBe(false);

    // 8h30-9h30 aussi bloqué (chevauchement - 06:30 UTC)
    const overlap = slots.find((s) => s.startTime === '2025-06-15T06:30:00.000Z');
    expect(overlap?.available).toBe(false);

    // 10h00-11h00 libre (08:00 UTC)
    const after = slots.find((s) => s.startTime === '2025-06-15T08:00:00.000Z');
    expect(after?.available).toBe(true);
  });

  it('inclut un PENDING récent dans le calcul de conflit', async () => {
    prismaMock.court.findUniqueOrThrow.mockResolvedValue({
      openHour: 8,
      closeHour: 22,
    } as any);
    prismaMock.reservation.findMany.mockResolvedValue([
      {
        startTime: new Date('2025-06-15T07:00:00.000Z'),
        endTime:   new Date('2025-06-15T08:00:00.000Z'),
        status:    'PENDING',
      } as any,
    ]);

    const slots = await service.getAvailableSlots('court-1', '2025-06-15', 60);

    const blocked = slots.find((s) => s.startTime === '2025-06-15T07:00:00.000Z');
    expect(blocked?.available).toBe(false);
  });

  it('le dernier créneau de 90 min se termine à l\'heure de fermeture', async () => {
    prismaMock.court.findUniqueOrThrow.mockResolvedValue({
      openHour: 8,
      closeHour: 22,
    } as any);
    prismaMock.reservation.findMany.mockResolvedValue([]);

    const slots = await service.getAvailableSlots('court-1', '2025-06-15', 90);
    const last = slots[slots.length - 1];

    // 8h = UTC+2, so 6h UTC. Last 90-min slot that fits before 22h (20h UTC) is 20h30 Paris = 18h30 UTC
    expect(last.endTime).toBe('2025-06-15T20:00:00.000Z'); // 22h Paris = 20h UTC
  });
});
