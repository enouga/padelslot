import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../db/prisma';

const router = Router();

// Catalogue public des sports gérés par la plateforme.
router.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const sports = await prisma.sport.findMany({
      where: { published: true },
      orderBy: { name: 'asc' },
      select: {
        id: true, key: true, name: true, resourceNoun: true,
        defaultSlotStepMin: true, defaultDurationsMin: true, icon: true, surfaces: true, published: true,
      },
    });
    res.json(sports);
  } catch (err) { next(err); }
});

export default router;
