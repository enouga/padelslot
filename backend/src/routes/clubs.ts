import { Router, Request, Response, NextFunction } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { ClubService } from '../services/club.service';
import { AvailabilityService } from '../services/availability.service';
import { AnnouncementService } from '../services/announcement.service';
import { SponsorService } from '../services/sponsor.service';
import { TournamentService } from '../services/tournament.service';
import { EventService } from '../services/event.service';
import { PackageService } from '../services/package.service';
import { iconService } from '../services/icon.service';
import { prisma } from '../db/prisma';

const router = Router();
const clubService = new ClubService();
const availabilityService = new AvailabilityService();
const announcementService = new AnnouncementService();
const sponsorService = new SponsorService();
const tournamentService = new TournamentService();
const eventService = new EventService();
const packageService = new PackageService();

const ERROR_STATUS: Record<string, number> = {
  VALIDATION_ERROR:    400,
  SLUG_RESERVED:       400,
  SLUG_TAKEN:          409,
  CLUB_NOT_FOUND:      404,
  MEMBERSHIP_REQUIRED: 403,
  MEMBERSHIP_BLOCKED:  403,
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

// Résolution d'un libellé de sous-domaine : slug actuel ({moved:false}) ou alias historique ({moved:true}).
// Préfixe `_` : slugify() ne produit jamais d'underscore → aucune collision avec un vrai slug.
// Déclarée en PREMIER pour ne pas être interceptée par les routes /:slug/*.
router.get('/_resolve/:slug', async (req: Request, res: Response, next: NextFunction) => {
  try { res.json(await clubService.resolveSlug(asString(req.params.slug))); }
  catch (err) { handleError(err, res, next); }
});

// Auto-inscription : crée un club, l'auteur devient OWNER.
router.post('/', authMiddleware, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { name, slug, address, city, timezone } = req.body;
    const club = await clubService.createClub({ ownerId: req.user!.id, name, slug, address, city, timezone });
    res.status(201).json(club);
  } catch (err) { handleError(err, res, next); }
});

// Annuaire public — filtres optionnels sport (key), city, q (nom).
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const clubs = await clubService.listClubs({
      sport: asString(req.query.sport) || undefined,
      city:  asString(req.query.city) || undefined,
      q:     asString(req.query.q) || undefined,
    });
    res.json(clubs);
  } catch (err) { handleError(err, res, next); }
});

// Disponibilités de tous les terrains du club pour une date+durée (vue planning).
router.get('/:slug/availability', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const date = asString(req.query.date);
    const duration = parseInt(asString(req.query.duration), 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return void res.status(400).json({ error: 'date doit être YYYY-MM-DD' });
    if (isNaN(duration) || duration <= 0 || duration > 240) return void res.status(400).json({ error: 'duration invalide' });

    const club = await prisma.club.findUnique({ where: { slug: asString(req.params.slug) }, select: { id: true, status: true } });
    if (!club || club.status !== 'ACTIVE') return void res.status(404).json({ error: 'CLUB_NOT_FOUND' });

    res.json(await availabilityService.getClubAvailability(club.id, date, duration));
  } catch (err) { handleError(err, res, next); }
});

// Auto-inscription du joueur connecté à un club (adhésion automatique, idempotente).
router.post('/:slug/join', authMiddleware, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const club = await prisma.club.findUnique({ where: { slug: asString(req.params.slug) }, select: { id: true, status: true } });
    if (!club || club.status !== 'ACTIVE') return void res.status(404).json({ error: 'CLUB_NOT_FOUND' });
    await clubService.ensureMembership(req.user!.id, club.id);
    res.status(201).json({ ok: true });
  } catch (err) { handleError(err, res, next); }
});

// NB : l'abonnement (fenêtre élargie) est un attribut de la fiche-membre, géré par
// le club (back-office, /:clubId/admin/members). Pas d'auto-abonnement côté joueur.

// Annonces publiées d'un club (mur d'annonces public).
router.get('/:slug/announcements', async (req, res, next) => {
  try { res.json(await announcementService.listPublic(asString(req.params.slug))); }
  catch (err) { handleError(err, res, next); }
});

// Sponsors actifs d'un club (affichage public).
router.get('/:slug/sponsors', async (req, res, next) => {
  try { res.json(await sponsorService.listPublic(asString(req.params.slug))); }
  catch (err) { handleError(err, res, next); }
});

// Tournois publiés d'un club (à venir).
router.get('/:slug/tournaments', async (req, res, next) => {
  try { res.json(await tournamentService.listPublicByClubSlug(asString(req.params.slug))); }
  catch (err) { handleError(err, res, next); }
});

// Animations publiées d'un club (à venir).
router.get('/:slug/events', async (req, res, next) => {
  try { res.json(await eventService.listPublicByClubSlug(asString(req.params.slug))); }
  catch (err) { handleError(err, res, next); }
});

// Recherche de membres du club par nom (réservé aux membres ; pour choisir un coéquipier de tournoi).
router.get('/:slug/members/search', authMiddleware, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try { res.json(await clubService.searchMembers(asString(req.params.slug), req.user!.id, asString(req.query.q))); }
  catch (err) { handleError(err, res, next); }
});

// Adhésion du joueur connecté à ce club (licence / statut).
router.get('/:slug/me/membership', authMiddleware, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try { res.json(await clubService.getMyMembership(asString(req.params.slug), req.user!.id)); }
  catch (err) { handleError(err, res, next); }
});

// Le joueur renseigne / corrige sa propre licence (n° adhérent) pour ce club.
router.patch('/:slug/me/membership', authMiddleware, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { membershipNo } = req.body;
    res.json(await clubService.setMyMembership(asString(req.params.slug), req.user!.id, asString(membershipNo)));
  } catch (err) { handleError(err, res, next); }
});

// Soldes prépayés (carnets / porte-monnaie) du joueur connecté sur ce club.
router.get('/:slug/me/packages', authMiddleware, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try { res.json(await packageService.listMyPackagesBySlug(asString(req.params.slug), req.user!.id)); }
  catch (err) { handleError(err, res, next); }
});

// Icône PWA du club (référencée par le manifest) — public, PNG, repli Palova.
router.get('/:slug/icon/:file', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const m = asString(req.params.file).match(/^([a-z0-9-]+)\.png$/);
    const filePath = m ? await iconService.getClubIconPath(asString(req.params.slug), m[1]) : null;
    if (!filePath) { res.status(404).json({ error: 'Icône introuvable' }); return; }
    res.sendFile(filePath, { headers: { 'Cache-Control': 'public, max-age=86400' } });
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
