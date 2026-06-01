import { DateTime } from 'luxon';
import { prisma } from '../db/prisma';

export interface TimeSlot {
  startTime: string;
  endTime: string;
  available: boolean;
}

const HOLD_EXPIRY_MINUTES = 10;

export class AvailabilityService {
  async getAvailableSlots(
    resourceId: string,
    date: string,
    durationMinutes: number,
  ): Promise<TimeSlot[]> {
    const resource = await prisma.resource.findUniqueOrThrow({
      where: { id: resourceId },
      select: {
        openHour: true,
        closeHour: true,
        club: { select: { timezone: true } },
        clubSport: { select: { slotStepMin: true, sport: { select: { defaultSlotStepMin: true } } } },
      },
    });

    const tz = resource.club.timezone;
    const slotStepMin = resource.clubSport.slotStepMin ?? resource.clubSport.sport.defaultSlotStepMin;

    // Ouverture/fermeture exprimées en heure LOCALE du club, converties en instants UTC.
    const dayStartLocal = DateTime.fromISO(date, { zone: tz }).startOf('day');
    if (!dayStartLocal.isValid) throw new Error('INVALID_DATE');

    const open = dayStartLocal.set({ hour: resource.openHour }).toUTC();
    const close = dayStartLocal.set({ hour: resource.closeHour }).toUTC();

    const tenMinutesAgo = new Date(Date.now() - HOLD_EXPIRY_MINUTES * 60 * 1000);

    const activeReservations = await prisma.reservation.findMany({
      where: {
        resourceId,
        OR: [
          { status: 'CONFIRMED' },
          { status: 'PENDING', createdAt: { gt: tenMinutesAgo } },
        ],
        startTime: { lt: close.toJSDate() },
        endTime: { gt: open.toJSDate() },
      },
      select: { startTime: true, endTime: true },
    });

    const slots: TimeSlot[] = [];
    let cursor = open;
    while (cursor.plus({ minutes: durationMinutes }) <= close) {
      const slotStart = cursor.toJSDate();
      const slotEnd = cursor.plus({ minutes: durationMinutes }).toJSDate();

      const hasConflict = activeReservations.some(
        (r) => r.startTime < slotEnd && r.endTime > slotStart,
      );

      slots.push({
        startTime: cursor.toISO()!,
        endTime: cursor.plus({ minutes: durationMinutes }).toISO()!,
        available: !hasConflict,
      });

      cursor = cursor.plus({ minutes: slotStepMin });
    }

    return slots;
  }
}
