import { Router, Response, NextFunction } from 'express';
import { TournamentService } from '../services/tournament.service';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();
const service = new TournamentService();

const ERROR_STATUS: Record<string, number> = {
  TOURNAMENT_NOT_FOUND:   404,
  TOURNAMENT_NOT_OPEN:    409,
  REGISTRATION_CLOSED:    409,
  REGISTRATION_LOCKED:    409,
  REGISTRATION_NOT_FOUND: 404,
  PARTNER_NOT_FOUND:      404,
  PARTNER_IS_SELF:        400,
  USER_NOT_FOUND:         404,
  MEMBERSHIP_REQUIRED:    403,
  MEMBERSHIP_BLOCKED:     403,
  PHONE_REQUIRED:         422,
  LICENSE_REQUIRED:       422,
  SEX_REQUIRED:           422,
  GENDER_MISMATCH:        422,
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
  if (status) {
    const subject = (err as { subject?: string }).subject;
    return void res.status(status).json({ error: message, ...(subject ? { subject } : {}) });
  }
  next(err);
};

// Détail public d'un tournoi (pas d'auth ; le DRAFT est masqué par le service).
router.get('/:id', async (req, res, next) => {
  try { res.json(await service.getById(asString(req.params.id))); }
  catch (err) { handleError(err, res, next); }
});

router.post('/:id/register', authMiddleware, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { partnerUserId } = req.body;
    if (!partnerUserId) return void res.status(400).json({ error: 'partnerUserId requis' });
    res.status(201).json(await service.register(asString(req.params.id), req.user!.id, asString(partnerUserId)));
  } catch (err) { handleError(err, res, next); }
});

router.patch('/:id/registration', authMiddleware, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { partnerUserId } = req.body;
    if (!partnerUserId) return void res.status(400).json({ error: 'partnerUserId requis' });
    res.json(await service.changePartner(asString(req.params.id), req.user!.id, asString(partnerUserId)));
  } catch (err) { handleError(err, res, next); }
});

router.delete('/:id/registration', authMiddleware, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try { res.json(await service.cancelRegistration(asString(req.params.id), req.user!.id)); }
  catch (err) { handleError(err, res, next); }
});

export default router;
