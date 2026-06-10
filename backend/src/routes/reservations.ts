import { Router, Response, NextFunction } from 'express';
import { ReservationService } from '../services/reservation.service';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();
const reservationService = new ReservationService();

const ERROR_STATUS: Record<string, number> = {
  SLOT_ALREADY_HELD:        409,
  SLOT_NOT_AVAILABLE:       409,
  RESERVATION_NOT_FOUND:    404,
  RESERVATION_NOT_PENDING:  409,
  SLOT_NO_LONGER_AVAILABLE: 409,
  UNAUTHORIZED:             403,
  ALREADY_CANCELLED:        409,
  BOOKING_TOO_FAR:          409,
  MEMBERSHIP_BLOCKED:       403,
  RESERVATION_NOT_ACTIVE:   409,
  RESERVATION_IN_PAST:      409,
  OUT_OF_HOURS:             409,
  RESOURCE_NOT_FOUND:       404,
  CLUB_MISMATCH:            403,
  VALIDATION_ERROR:         400,
  INSUFFICIENT_BALANCE:     409,
  PACKAGE_NOT_FOUND:        404,
};

function asString(v: unknown): string {
  if (typeof v === 'string') return v;
  if (Array.isArray(v) && typeof v[0] === 'string') return v[0];
  return '';
}

const handleError = (err: unknown, res: Response, next: NextFunction) => {
  const message = (err as Error).message;
  const status  = ERROR_STATUS[message];
  if (status) return void res.status(status).json({ error: message });
  next(err);
};

router.post('/hold', authMiddleware, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { resourceId, startTime, endTime } = req.body;
    if (!resourceId || !startTime || !endTime) {
      return void res.status(400).json({ error: 'resourceId, startTime, endTime requis' });
    }
    const reservation = await reservationService.holdSlot({
      resourceId, userId: req.user!.id,
      startTime: new Date(startTime),
      endTime:   new Date(endTime),
    });
    res.status(201).json(reservation);
  } catch (err) { handleError(err, res, next); }
});

router.post('/:id/confirm', authMiddleware, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const packageId = req.body?.paymentSource?.packageId;
    const confirmed = await reservationService.confirmReservation(
      asString(req.params.id), req.user!.id,
      typeof packageId === 'string' && packageId ? { packageId } : undefined,
    );
    res.json(confirmed);
  } catch (err) { handleError(err, res, next); }
});

router.post('/:id/reschedule', authMiddleware, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { resourceId, startTime, duration } = req.body;
    if (!resourceId || !startTime || !duration) {
      return void res.status(400).json({ error: 'resourceId, startTime, duration requis' });
    }
    const moved = await reservationService.rescheduleReservation(
      asString(req.params.id), req.user!.id,
      { resourceId, startTime: new Date(startTime), duration: Number(duration) },
    );
    res.json(moved);
  } catch (err) { handleError(err, res, next); }
});

router.delete('/:id', authMiddleware, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const cancelled = await reservationService.cancelReservation(asString(req.params.id), req.user!.id);
    res.json(cancelled);
  } catch (err) { handleError(err, res, next); }
});

export default router;
