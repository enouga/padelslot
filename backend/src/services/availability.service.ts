import { prisma } from '../db/prisma';

export interface TimeSlot {
  startTime: string;
  endTime: string;
  available: boolean;
}

const SLOT_STEP_MINUTES = 30;
const HOLD_EXPIRY_MINUTES = 10;

export class AvailabilityService {
  async getAvailableSlots(
    courtId: string,
    date: string,
    durationMinutes: number,
  ): Promise<TimeSlot[]> {
    const court = await prisma.court.findUniqueOrThrow({
      where: { id: courtId },
      select: { openHour: true, closeHour: true },
    });

    const tenMinutesAgo = new Date(Date.now() - HOLD_EXPIRY_MINUTES * 60 * 1000);

    const dayStart = new Date(`${date}T00:00:00.000Z`);
    const dayEnd   = new Date(`${date}T23:59:59.999Z`);

    const activeReservations = await prisma.reservation.findMany({
      where: {
        courtId,
        OR: [
          { status: 'CONFIRMED' },
          { status: 'PENDING', createdAt: { gt: tenMinutesAgo } },
        ],
        startTime: { lt: dayEnd },
        endTime:   { gt: dayStart },
      },
      select: { startTime: true, endTime: true },
    });

    // openHour/closeHour are in Paris local time (UTC+2 summer)
    // TODO: use club timezone with a proper library for production
    const UTC_OFFSET = 2;
    const openUTC  = court.openHour  - UTC_OFFSET;
    const closeUTC = court.closeHour - UTC_OFFSET;

    const slots: TimeSlot[] = [];
    const durationMs = durationMinutes * 60 * 1000;
    const stepMs     = SLOT_STEP_MINUTES * 60 * 1000;

    let cursor  = new Date(`${date}T${String(openUTC).padStart(2, '0')}:00:00.000Z`);
    const close = new Date(`${date}T${String(closeUTC).padStart(2, '0')}:00:00.000Z`);

    while (cursor.getTime() + durationMs <= close.getTime()) {
      const slotStart = new Date(cursor);
      const slotEnd   = new Date(cursor.getTime() + durationMs);

      const hasConflict = activeReservations.some(
        (r) => r.startTime < slotEnd && r.endTime > slotStart,
      );

      slots.push({
        startTime: slotStart.toISOString(),
        endTime:   slotEnd.toISOString(),
        available: !hasConflict,
      });

      cursor = new Date(cursor.getTime() + stepMs);
    }

    return slots;
  }
}
