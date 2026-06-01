import { Router, Request, Response, NextFunction } from 'express';
import { AvailabilityService } from '../services/availability.service';
import { ResourceService } from '../services/resource.service';
import { SSEService } from '../services/sse.service';

const router = Router();
const availabilityService = new AvailabilityService();
const resourceService = new ResourceService();

function asString(v: unknown): string {
  if (typeof v === 'string') return v;
  if (Array.isArray(v) && typeof v[0] === 'string') return v[0];
  return '';
}

// Détail public d'une ressource (nom, tarif, fuseau, durées proposées).
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const resource = await resourceService.getPublicResource(asString(req.params.id));
    res.json(resource);
  } catch (err) {
    if ((err as Error).message === 'RESOURCE_NOT_FOUND') {
      return void res.status(404).json({ error: 'RESOURCE_NOT_FOUND' });
    }
    next(err);
  }
});

// Disponibilités publiques d'une ressource (resourceId est globalement unique).
router.get('/:id/availability', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const resourceId = asString(req.params.id);
    const dateStr = asString(req.query.date);
    const durationStr = asString(req.query.duration);

    if (!dateStr || !durationStr) {
      return void res.status(400).json({ error: 'date et duration requis' });
    }
    const durationMinutes = parseInt(durationStr, 10);
    if (isNaN(durationMinutes) || durationMinutes <= 0 || durationMinutes > 240) {
      return void res.status(400).json({ error: 'duration invalide' });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      return void res.status(400).json({ error: 'date doit être YYYY-MM-DD' });
    }

    const slots = await availabilityService.getAvailableSlots(resourceId, dateStr, durationMinutes);
    res.json(slots);
  } catch (err) { next(err); }
});

// Flux SSE temps réel d'une ressource.
router.get('/:id/stream', (req: Request, res: Response) => {
  SSEService.getInstance().addClient(asString(req.params.id), res);
});

export default router;
