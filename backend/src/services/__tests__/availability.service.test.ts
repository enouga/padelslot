import '../../__mocks__/prisma';
import { prismaMock } from '../../__mocks__/prisma';
import { AvailabilityService } from '../availability.service';

// Ressource padel 8h–22h, fuseau du club par défaut Europe/Paris, pas de 30 min.
function mockResource(
  timezone = 'Europe/Paris',
  opts: { pricePerHour?: number; offPeakPricePerHour?: number | null; offPeakHours?: unknown } = {},
) {
  prismaMock.resource.findUniqueOrThrow.mockResolvedValue({
    openHour: 8,
    closeHour: 22,
    pricePerHour: opts.pricePerHour ?? 25,
    offPeakPricePerHour: opts.offPeakPricePerHour ?? null,
    club: { timezone, offPeakHours: opts.offPeakHours ?? null },
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

    // 8h -> 22h, créneaux fixes de 60 min → 14 créneaux (8:00, 9:00, ..., 21:00)
    expect(slots).toHaveLength(14);
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

  it('enchaîne les créneaux de 90 min par tranche de 90 min depuis l\'ouverture', async () => {
    mockResource();
    prismaMock.reservation.findMany.mockResolvedValue([]);

    const slots = await service.getAvailableSlots('court-1', '2025-06-15', 90);

    // 8h Paris = 6h UTC (CEST) ; pas de 90 min → 8h, 9h30, 11h…
    expect(slots[0].startTime).toBe('2025-06-15T06:00:00.000Z');
    expect(slots[1].startTime).toBe('2025-06-15T07:30:00.000Z');
    // 14h d'ouverture non divisibles par 90 min : dernier créneau 20h→21h30 Paris (18h→19h30 UTC)
    const last = slots[slots.length - 1];
    expect(last.startTime).toBe('2025-06-15T18:00:00.000Z');
    expect(last.endTime).toBe('2025-06-15T19:30:00.000Z');
  });

  it('applique le tarif heures creuses dans les plages configurées', async () => {
    // 2025-06-15 = dimanche (weekday Luxon 7). Heures creuses ce jour : 8h–18h.
    mockResource('Europe/Paris', { pricePerHour: 25, offPeakPricePerHour: 18, offPeakHours: { 7: [{ start: 8, end: 18 }] } });
    prismaMock.reservation.findMany.mockResolvedValue([]);

    const slots = await service.getAvailableSlots('court-1', '2025-06-15', 60);

    const morning = slots.find((s) => s.startTime === '2025-06-15T08:00:00.000Z'); // 10h Paris → creux
    expect(morning?.offPeak).toBe(true);
    expect(morning?.pricePerHour).toBe('18');

    const evening = slots.find((s) => s.startTime === '2025-06-15T17:00:00.000Z'); // 19h Paris → plein
    expect(evening?.offPeak).toBe(false);
    expect(evening?.pricePerHour).toBe('25');
  });

  it('respecte le fuseau horaire du club (America/New_York)', async () => {
    mockResource('America/New_York');
    prismaMock.reservation.findMany.mockResolvedValue([]);

    const slots = await service.getAvailableSlots('court-1', '2025-06-15', 60);

    // 8h New York le 2025-06-15 (EDT, UTC-4) = 12h UTC
    expect(slots[0].startTime).toBe('2025-06-15T12:00:00.000Z');
  });
});
