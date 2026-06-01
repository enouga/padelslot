import cron from 'node-cron';
import { prisma } from '../db/prisma';
import { redis } from '../redis/client';
import { SSEService } from '../services/sse.service';

const HOLD_EXPIRY_MINUTES = 10;

export function startCleanupJob(): void {
  cron.schedule('* * * * *', async () => {
    const expiredBefore = new Date(Date.now() - HOLD_EXPIRY_MINUTES * 60 * 1000);

    try {
      const expired = await prisma.reservation.findMany({
        where: { status: 'PENDING', createdAt: { lt: expiredBefore } },
        select: { id: true, resourceId: true, startTime: true, endTime: true },
      });

      if (expired.length === 0) return;

      await prisma.reservation.updateMany({
        where: { id: { in: expired.map((r) => r.id) } },
        data:  { status: 'CANCELLED', cancelledAt: new Date() },
      });

      await Promise.all(
        expired.map(async (r) => {
          await redis.del(`lock:resource:${r.resourceId}:${r.startTime.toISOString()}`);
          SSEService.getInstance().broadcast(r.resourceId, {
            type:          'slot_released',
            resourceId:    r.resourceId,
            reservationId: r.id,
            startTime:     r.startTime.toISOString(),
            endTime:       r.endTime.toISOString(),
          });
        }),
      );

      console.log(`[cleanup] ${expired.length} réservation(s) PENDING expirée(s) annulées`);
    } catch (err) {
      console.error('[cleanup] Erreur:', (err as Error).message);
    }
  });

  console.log('[cleanup] Job de nettoyage démarré (toutes les minutes)');
}
