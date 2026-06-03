import { DateTime } from 'luxon';
import { prisma } from '../db/prisma';
import { bySortOrder } from './resource.service';

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
      },
    });

    const tz = resource.club.timezone;

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

      // Créneaux fixes consécutifs : on avance d'une durée pleine (et non d'une
      // granularité fine) — terrain ouvrant à 8h en 1h30 → 8h, 9h30, 11h…
      cursor = cursor.plus({ minutes: durationMinutes });
    }

    return slots;
  }

  /** Disponibilités de TOUS les terrains actifs d'un club (vue planning joueur). */
  async getClubAvailability(clubId: string, date: string, durationMinutes: number) {
    const resources = (await prisma.resource.findMany({
      where: { clubId, isActive: true },
      select: {
        id: true, name: true, attributes: true, pricePerHour: true,
        clubSport: { select: { id: true, sport: { select: { key: true, name: true } } } },
      },
    })).sort(bySortOrder);

    const result = [];
    for (const r of resources) {
      result.push({
        resource: {
          id: r.id, name: r.name, attributes: r.attributes, pricePerHour: r.pricePerHour,
          sport: r.clubSport.sport, clubSportId: r.clubSport.id,
        },
        slots: await this.getAvailableSlots(r.id, date, durationMinutes),
      });
    }
    return result;
  }
}
