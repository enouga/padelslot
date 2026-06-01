import '../../__mocks__/prisma';
import { prismaMock } from '../../__mocks__/prisma';
import { AvailabilityService } from '../availability.service';

// Ressource padel 8h–22h, fuseau du club par défaut Europe/Paris, pas de 30 min.
function mockResource(timezone = 'Europe/Paris') {
  prismaMock.resource.findUniqueOrThrow.mockResolvedValue({
    openHour: 8,
    closeHour: 22,
    club: { timezone },
    clubSport: { slotStepMin: null, sport: { defaultSlotStepMin: 30 } },
  } as any);
}

describe('AvailabilityService.getAvailableSlots', () => {
  let service: AvailabilityService;

  beforeEach(() => { service = new AvailabilityService(); });

  it('retourne tous les créneaux disponibles quand aucune réservation active', async () => {
    mockResource();
    prismaMock.reservation.findMany.mockResolvedValue([]);

    const slots = await service.getAvailableSlots('court-1', '2025-06-15', 60);

    // 8h -> 22h, step 30 min, duration 60 min → 27 créneaux (8:00, ..., 21:00)
    expect(slots).toHaveLength(27);
    expect(slots.every((s) => s.available)).toBe(true);
  });

  it('marque comme indisponible le créneau qui chevauche une réservation CONFIRMED', async () => {
    mockResource();
    prismaMock.reservation.findMany.mockResolvedValue([
      {
        startTime: new Date('2025-06-15T07:00:00.000Z'), // 9h Paris (UTC+2 en été)
        endTime:   new Date('2025-06-15T08:00:00.000Z'), // 10h Paris
        status:    'CONFIRMED',
      } as any,
    ]);

    const slots = await service.getAvailableSlots('court-1', '2025-06-15', 60);

    const blocked = slots.find((s) => s.startTime === '2025-06-15T07:00:00.000Z');
    expect(blocked?.available).toBe(false);

    const overlap = slots.find((s) => s.startTime === '2025-06-15T06:30:00.000Z');
    expect(overlap?.available).toBe(false);

    const after = slots.find((s) => s.startTime === '2025-06-15T08:00:00.000Z');
    expect(after?.available).toBe(true);
  });

  it('inclut un PENDING récent dans le calcul de conflit', async () => {
    mockResource();
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
    mockResource();
    prismaMock.reservation.findMany.mockResolvedValue([]);

    const slots = await service.getAvailableSlots('court-1', '2025-06-15', 90);
    const last = slots[slots.length - 1];

    // 22h Paris = 20h UTC (CEST)
    expect(last.endTime).toBe('2025-06-15T20:00:00.000Z');
  });

  it('respecte le fuseau horaire du club (America/New_York)', async () => {
    mockResource('America/New_York');
    prismaMock.reservation.findMany.mockResolvedValue([]);

    const slots = await service.getAvailableSlots('court-1', '2025-06-15', 60);

    // 8h New York le 2025-06-15 (EDT, UTC-4) = 12h UTC
    expect(slots[0].startTime).toBe('2025-06-15T12:00:00.000Z');
  });
});
