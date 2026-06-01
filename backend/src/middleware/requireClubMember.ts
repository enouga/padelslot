import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth';
import { prisma } from '../db/prisma';

export type ClubRole = 'OWNER' | 'ADMIN' | 'STAFF';

const RANK: Record<ClubRole, number> = { STAFF: 1, ADMIN: 2, OWNER: 3 };

export interface ClubScopedRequest extends AuthRequest {
  membership?: { clubId: string; role: ClubRole };
}

function asString(v: unknown): string {
  if (typeof v === 'string') return v;
  if (Array.isArray(v) && typeof v[0] === 'string') return v[0];
  return '';
}

/**
 * À utiliser APRÈS authMiddleware, sur des routes contenant :clubId.
 * Vérifie que l'utilisateur est membre du club avec au moins `minRole`.
 * Garantit, après passage, que req.membership est défini.
 */
export function requireClubMember(minRole: ClubRole = 'STAFF') {
  return async (req: ClubScopedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Token manquant' });
        return;
      }
      const clubId = asString(req.params.clubId);
      if (!clubId) {
        res.status(400).json({ error: 'clubId requis' });
        return;
      }
      const member = await prisma.clubMember.findUnique({
        where: { userId_clubId: { userId: req.user.id, clubId } },
      });
      if (!member || RANK[member.role as ClubRole] < RANK[minRole]) {
        res.status(403).json({ error: 'FORBIDDEN' });
        return;
      }
      req.membership = { clubId, role: member.role as ClubRole };
      next();
    } catch (err) {
      next(err);
    }
  };
}
