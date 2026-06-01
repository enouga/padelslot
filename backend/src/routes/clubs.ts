import { Router, Request, Response, NextFunction } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { ClubService } from '../services/club.service';

const router = Router();
const clubService = new ClubService();

const ERROR_STATUS: Record<string, number> = {
  VALIDATION_ERROR: 400,
  SLUG_TAKEN:       409,
  CLUB_NOT_FOUND:   404,
};

const handleError = (err: unknown, res: Response, next: NextFunction) => {
  const message = (err as Error).message;
  const status  = ERROR_STATUS[message];
  if (status) return void res.status(status).json({ error: message });
  next(err);
};

function asString(v: unknown): string {
  if (typeof v === 'string') return v;
  if (Array.isArray(v) && typeof v[0] === 'string') return v[0];
  return '';
}

// Auto-inscription : crée un club, l'auteur devient OWNER.
router.post('/', authMiddleware, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { name, slug, address, city, timezone } = req.body;
    const club = await clubService.createClub({ ownerId: req.user!.id, name, slug, address, city, timezone });
    res.status(201).json(club);
  } catch (err) { handleError(err, res, next); }
});

// Détail public d'un club par slug.
router.get('/:slug', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const club = await clubService.getClubBySlug(asString(req.params.slug));
    res.json(club);
  } catch (err) { handleError(err, res, next); }
});

export default router;
