import { Router, Response, NextFunction } from 'express';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { prisma } from '../db/prisma';
import { ReservationService } from '../services/reservation.service';
import { TournamentService } from '../services/tournament.service';
import { EventService } from '../services/event.service';
import { AVATARS_DIR, EXT_BY_MIME, ensureUploadDirs } from '../utils/uploads';

const router = Router();
const reservationService = new ReservationService();
const tournamentService = new TournamentService();
const eventService = new EventService();

// Champs du profil exposés au joueur (GET /profile, PATCH /, POST /avatar).
const PROFILE_SELECT = {
  id: true, email: true, firstName: true, lastName: true, phone: true, sex: true,
  birthDate: true, avatarUrl: true, locale: true, isSuperAdmin: true,
} as const;

const LOCALES = ['fr', 'en', 'es'] as const;
const avatarUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } });

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
    const user = await prisma.user.findUnique({ where: { id: req.user!.id }, select: PROFILE_SELECT });
    res.json(user);
  } catch (err) { next(err); }
});

// Mise à jour du profil : téléphone, sexe, date de naissance, langue.
router.patch('/', authMiddleware, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { phone, sex, birthDate, locale } = req.body;
    const data: { phone?: string | null; sex?: 'MALE' | 'FEMALE' | null; birthDate?: Date | null; locale?: string | null } = {};
    if (phone !== undefined) data.phone = typeof phone === 'string' && phone.trim() ? phone.trim() : null;
    if (sex !== undefined) {
      if (sex !== null && sex !== 'MALE' && sex !== 'FEMALE') return void res.status(400).json({ error: 'sex invalide' });
      data.sex = sex;
    }
    if (birthDate !== undefined) {
      if (birthDate === null) data.birthDate = null;
      else {
        const parsed = typeof birthDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(birthDate) ? new Date(birthDate) : null;
        // new Date('2026-02-30') glisse en mars : on revérifie que l'ISO retombe sur la saisie.
        if (!parsed || isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== birthDate) {
          return void res.status(400).json({ error: 'birthDate invalide' });
        }
        data.birthDate = parsed;
      }
    }
    if (locale !== undefined) {
      if (locale !== null && !LOCALES.includes(locale)) return void res.status(400).json({ error: 'locale invalide' });
      data.locale = locale;
    }
    const user = await prisma.user.update({ where: { id: req.user!.id }, data, select: PROFILE_SELECT });
    res.json(user);
  } catch (err) { next(err); }
});

// Avatar : upload d'une photo (JPEG/PNG/WebP, 2 Mo max), remplace l'ancienne.
router.post('/avatar', authMiddleware, (req: AuthRequest, res: Response, next: NextFunction) => {
  avatarUpload.single('avatar')(req, res, async (err: unknown) => {
    try {
      if (err) {
        if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
          return void res.status(400).json({ error: 'Image trop lourde (2 Mo max)' });
        }
        return next(err as Error);
      }
      const file = req.file;
      const ext = file && EXT_BY_MIME[file.mimetype];
      if (!file || !ext) {
        return void res.status(400).json({ error: 'Format d’image non supporté (JPEG, PNG ou WebP)' });
      }
      const previous = await prisma.user.findUnique({ where: { id: req.user!.id }, select: { avatarUrl: true } });
      const filename = `${req.user!.id}-${Date.now()}.${ext}`;
      ensureUploadDirs();
      await fs.promises.writeFile(path.join(AVATARS_DIR, filename), file.buffer);
      const user = await prisma.user.update({
        where: { id: req.user!.id },
        data: { avatarUrl: `/uploads/avatars/${filename}` },
        select: PROFILE_SELECT,
      });
      // Nettoyage best-effort de l'ancienne photo (jamais bloquant).
      if (previous?.avatarUrl?.startsWith('/uploads/avatars/')) {
        fs.promises.unlink(path.join(AVATARS_DIR, path.basename(previous.avatarUrl))).catch(() => {});
      }
      res.json(user);
    } catch (e) { next(e as Error); }
  });
});

// Inscriptions tournois du joueur connecté.
router.get('/tournaments', authMiddleware, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try { res.json(await tournamentService.listUserRegistrations(req.user!.id)); }
  catch (err) { next(err); }
});

// Inscriptions actives du joueur aux animations (tous clubs).
router.get('/events', authMiddleware, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try { res.json(await eventService.listUserRegistrations(req.user!.id)); }
  catch (err) { next(err); }
});

export default router;
