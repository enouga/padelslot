import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth';
import { prisma } from '../db/prisma';

/**
 * À utiliser APRÈS authMiddleware. Revérifie en base que l'utilisateur est
 * super-admin plateforme (le flag n'est PAS dans le JWT, donc révoquable
 * immédiatement). Sinon 403.
 */
export async function requireSuperAdmin(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Token manquant' });
      return;
    }
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { isSuperAdmin: true },
    });
    if (!user || !user.isSuperAdmin) {
      res.status(403).json({ error: 'Accès super-admin requis' });
      return;
    }
    next();
  } catch (err) {
    next(err);
  }
}
