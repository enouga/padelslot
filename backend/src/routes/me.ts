import { Router, Response, NextFunction } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { prisma } from '../db/prisma';
import { ReservationService } from '../services/reservation.service';
import { TournamentService } from '../services/tournament.service';

const router = Router();
const reservationService = new ReservationService();
const tournamentService = new TournamentService();

// Clubs gérés par l'utilisateur connecté (pour le gating UX du back-office).
router.get('/clubs', authMiddleware, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const memberships = await prisma.clubMember.findMany({
      where: { userId: req.user!.id },
      select: {
        role: true,
        club: { select: { id: true, slug: true, name: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
    res.json(memberships.map((m) => ({ clubId: m.club.id, slug: m.club.slug, name: m.club.name, role: m.role })));
  } catch (err) { next(err); }
});

// Adhésions du joueur connecté (clubs dont il est membre, + statut abonné).
router.get('/memberships', authMiddleware, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const memberships = await prisma.clubMembership.findMany({
      where: { userId: req.user!.id },
      orderBy: { club: { name: 'asc' } },
      select: {
        isSubscriber: true,
        status: true,
        club: {
          select: {
            id: true, slug: true, name: true, city: true, description: true,
            accentColor: true, logoUrl: true, status: true,
            clubSports: { select: { sport: { select: { key: true, name: true, icon: true } } } },
            _count: { select: { resources: true } },
          },
        },
      },
    });
    // On expose un objet `club` au format ClubSummary (pour rendre des cartes côté accueil),
    // tout en conservant clubId/slug/isSubscriber/status (consommés par ClubHome + /reserver).
    // Filtre sur club.status ACTIVE (statut DU CLUB) — distinct de `status` (statut d'adhésion).
    res.json(
      memberships
        .filter((m) => m.club.status === 'ACTIVE')
        .map((m) => ({
          clubId: m.club.id,
          slug: m.club.slug,
          isSubscriber: m.isSubscriber,
          status: m.status,
          club: {
            id: m.club.id, slug: m.club.slug, name: m.club.name, city: m.club.city,
            description: m.club.description, accentColor: m.club.accentColor, logoUrl: m.club.logoUrl,
            sports: m.club.clubSports.map((cs) => cs.sport),
            resourceCount: m.club._count.resources,
          },
        })),
    );
  } catch (err) { next(err); }
});

// Réservations du joueur connecté.
router.get('/reservations', authMiddleware, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    res.json(await reservationService.listUserReservations(req.user!.id));
  } catch (err) { next(err); }
});

// Profil du joueur connecté (pour savoir si tél/sexe sont renseignés).
router.get('/profile', authMiddleware, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: { id: true, email: true, firstName: true, lastName: true, phone: true, sex: true },
    });
    res.json(user);
  } catch (err) { next(err); }
});

// Mise à jour du profil : téléphone et/ou sexe (pré-requis d'inscription tournoi).
router.patch('/', authMiddleware, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { phone, sex } = req.body;
    const data: { phone?: string | null; sex?: 'MALE' | 'FEMALE' | null } = {};
    if (phone !== undefined) data.phone = typeof phone === 'string' && phone.trim() ? phone.trim() : null;
    if (sex !== undefined) {
      if (sex !== null && sex !== 'MALE' && sex !== 'FEMALE') return void res.status(400).json({ error: 'sex invalide' });
      data.sex = sex;
    }
    const user = await prisma.user.update({
      where: { id: req.user!.id }, data,
      select: { id: true, email: true, firstName: true, lastName: true, phone: true, sex: true },
    });
    res.json(user);
  } catch (err) { next(err); }
});

// Inscriptions tournois du joueur connecté.
router.get('/tournaments', authMiddleware, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try { res.json(await tournamentService.listUserRegistrations(req.user!.id)); }
  catch (err) { next(err); }
});

export default router;
