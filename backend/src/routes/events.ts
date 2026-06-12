import { Router, Response, NextFunction } from 'express';
import { EventService } from '../services/event.service';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();
const service = new EventService();

const ERROR_STATUS: Record<string, number> = {
  EVENT_NOT_FOUND:        404,
  EVENT_NOT_OPEN:         409,
  REGISTRATION_CLOSED:    409,
  REGISTRATION_LOCKED:    409,
  REGISTRATION_NOT_FOUND: 404,
  MEMBERSHIP_REQUIRED:    403,
  MEMBERSHIP_BLOCKED:     403,
  ALREADY_REGISTERED:     409,
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

// Détail public d'un événement (pas d'auth ; le DRAFT est masqué par le service).
router.get('/:id', async (req, res, next) => {
  try { res.json(await service.getById(asString(req.params.id))); }
  catch (err) { handleError(err, res, next); }
});

// Liste publique des inscrits (noms + avatar, jamais l'e-mail).
router.get('/:id/participants', async (req, res, next) => {
  try { res.json(await service.listParticipants(asString(req.params.id))); }
  catch (err) { handleError(err, res, next); }
});

router.post('/:id/register', authMiddleware, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try { res.status(201).json(await service.register(asString(req.params.id), req.user!.id)); }
  catch (err) { handleError(err, res, next); }
});

router.delete('/:id/registration', authMiddleware, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try { res.json(await service.cancelRegistration(asString(req.params.id), req.user!.id)); }
  catch (err) { handleError(err, res, next); }
});

export default router;
