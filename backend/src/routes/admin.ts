import { Router, Response, NextFunction } from 'express';
import { authMiddleware } from '../middleware/auth';
import { requireClubMember, ClubScopedRequest } from '../middleware/requireClubMember';
import { ResourceService } from '../services/resource.service';
import { ReservationService } from '../services/reservation.service';
import { ClubService } from '../services/club.service';
import { AnnouncementService } from '../services/announcement.service';
import { SponsorService } from '../services/sponsor.service';

// mergeParams pour accéder à :clubId défini sur le point de montage.
const router = Router({ mergeParams: true });
const resourceService = new ResourceService();
const reservationService = new ReservationService();
const clubService = new ClubService();
const announcementService = new AnnouncementService();
const sponsorService = new SponsorService();

const ERROR_STATUS: Record<string, number> = {
  FORBIDDEN:             403,
  RESOURCE_NOT_FOUND:    404,
  CLUB_SPORT_NOT_FOUND:  404,
  SPORT_NOT_FOUND:       404,
  VALIDATION_ERROR:      400,
  CLUB_MISMATCH:         403,
  RESERVATION_NOT_FOUND: 404,
  ALREADY_CANCELLED:     409,
  USER_NOT_FOUND:        404,
  MEMBER_NOT_FOUND:      404,
  ANNOUNCEMENT_NOT_FOUND: 404,
  SPONSOR_NOT_FOUND:      404,
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

const STATUSES = ['PENDING', 'CONFIRMED', 'CANCELLED'] as const;
const RESERVATION_TYPES = ['COURT', 'COACHING', 'TOURNAMENT', 'EVENT'] as const;

// Toutes les routes admin : auth puis appartenance au club.
// Lot 1 : tout membre (OWNER/ADMIN/STAFF) a accès au back-office.
// Lot 2 : permissions fines (ex. STAFF en lecture seule sur le branding).
router.use(authMiddleware, requireClubMember('STAFF'));

// --- Profil & branding du club ---

router.get('/', async (req: ClubScopedRequest, res: Response, next: NextFunction) => {
  try {
    res.json(await clubService.getClubForAdmin(req.membership!.clubId));
  } catch (err) { handleError(err, res, next); }
});

router.patch('/', async (req: ClubScopedRequest, res: Response, next: NextFunction) => {
  try {
    const club = await clubService.updateClub(req.membership!.clubId, req.body);
    res.json(club);
  } catch (err) { handleError(err, res, next); }
});

// --- Sports activés ---

router.get('/sports', async (req: ClubScopedRequest, res: Response, next: NextFunction) => {
  try {
    res.json(await clubService.listClubSports(req.membership!.clubId));
  } catch (err) { handleError(err, res, next); }
});

router.post('/sports', async (req: ClubScopedRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.body.sportId) return void res.status(400).json({ error: 'sportId requis' });
    const cs = await clubService.addClubSport(req.membership!.clubId, req.body.sportId);
    res.status(201).json(cs);
  } catch (err) { handleError(err, res, next); }
});

// Durées proposées pour un sport du club.
router.patch('/sports/:clubSportId', async (req: ClubScopedRequest, res: Response, next: NextFunction) => {
  try {
    if (!Array.isArray(req.body.durationsMin)) return void res.status(400).json({ error: 'durationsMin (number[]) requis' });
    const cs = await clubService.updateClubSport(asString(req.params.clubSportId), req.membership!.clubId, req.body.durationsMin.map(Number));
    res.json(cs);
  } catch (err) { handleError(err, res, next); }
});

// --- Ressources ---

router.get('/resources', async (req: ClubScopedRequest, res: Response, next: NextFunction) => {
  try {
    res.json(await resourceService.listClubResources(req.membership!.clubId));
  } catch (err) { handleError(err, res, next); }
});

router.post('/resources', async (req: ClubScopedRequest, res: Response, next: NextFunction) => {
  try {
    const { clubSportId, name, attributes, pricePerHour, openHour, closeHour, slotStepMin } = req.body;
    if (!clubSportId) return void res.status(400).json({ error: 'clubSportId requis' });
    const resource = await resourceService.createResource({
      clubId: req.membership!.clubId, clubSportId, name, attributes, pricePerHour, openHour, closeHour, slotStepMin,
    });
    res.status(201).json(resource);
  } catch (err) { handleError(err, res, next); }
});

// Réordonne les ressources — placé AVANT /resources/:id pour ne pas être capturé.
router.patch('/resources/reorder', async (req: ClubScopedRequest, res: Response, next: NextFunction) => {
  try {
    const { orderedIds } = req.body;
    if (!Array.isArray(orderedIds) || !orderedIds.every((x) => typeof x === 'string')) {
      return void res.status(400).json({ error: 'orderedIds (string[]) requis' });
    }
    await resourceService.reorderResources(req.membership!.clubId, orderedIds);
    res.json(await resourceService.listClubResources(req.membership!.clubId));
  } catch (err) { handleError(err, res, next); }
});

router.patch('/resources/:id', async (req: ClubScopedRequest, res: Response, next: NextFunction) => {
  try {
    const { name, attributes, pricePerHour, openHour, closeHour, slotStepMin } = req.body;
    const resource = await resourceService.updateResource(asString(req.params.id), req.membership!.clubId, {
      name, attributes, pricePerHour, openHour, closeHour, slotStepMin,
    });
    res.json(resource);
  } catch (err) { handleError(err, res, next); }
});

router.patch('/resources/:id/active', async (req: ClubScopedRequest, res: Response, next: NextFunction) => {
  try {
    if (typeof req.body.isActive !== 'boolean') {
      return void res.status(400).json({ error: 'isActive (boolean) requis' });
    }
    const resource = await resourceService.setResourceActive(
      asString(req.params.id), req.membership!.clubId, req.body.isActive,
    );
    res.json(resource);
  } catch (err) { handleError(err, res, next); }
});

// --- Membres (fichier-membres du club) ---

router.get('/members', async (req: ClubScopedRequest, res: Response, next: NextFunction) => {
  try {
    res.json(await clubService.listMembers(req.membership!.clubId));
  } catch (err) { handleError(err, res, next); }
});

// Ajout d'un membre par email (compte joueur existant requis).
router.post('/members', async (req: ClubScopedRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.body.email) return void res.status(400).json({ error: 'email requis' });
    res.status(201).json(await clubService.addMemberByEmail(req.membership!.clubId, req.body.email));
  } catch (err) { handleError(err, res, next); }
});

// Création directe d'un membre (crée le compte + l'adhésion ; renvoie un mdp temporaire).
router.post('/members/create', async (req: ClubScopedRequest, res: Response, next: NextFunction) => {
  try {
    const { firstName, lastName, email, phone, membershipNo } = req.body;
    res.status(201).json(await clubService.createMember(req.membership!.clubId, { firstName, lastName, email, phone, membershipNo }));
  } catch (err) { handleError(err, res, next); }
});

router.patch('/members/:id/blocked', async (req: ClubScopedRequest, res: Response, next: NextFunction) => {
  try {
    if (typeof req.body.blocked !== 'boolean') return void res.status(400).json({ error: 'blocked (boolean) requis' });
    res.json(await clubService.setMemberBlocked(req.membership!.clubId, asString(req.params.id), req.body.blocked));
  } catch (err) { handleError(err, res, next); }
});

router.patch('/members/:id', async (req: ClubScopedRequest, res: Response, next: NextFunction) => {
  try {
    const { isSubscriber, membershipNo, status, note, phone } = req.body;
    res.json(await clubService.updateMembership(req.membership!.clubId, asString(req.params.id), { isSubscriber, membershipNo, status, note, phone }));
  } catch (err) { handleError(err, res, next); }
});

router.delete('/members/:id', async (req: ClubScopedRequest, res: Response, next: NextFunction) => {
  try {
    await clubService.removeMember(req.membership!.clubId, asString(req.params.id));
    res.json({ ok: true });
  } catch (err) { handleError(err, res, next); }
});

// --- Réservations ---

router.get('/reservations', async (req: ClubScopedRequest, res: Response, next: NextFunction) => {
  try {
    const date       = asString(req.query.date);
    const resourceId = asString(req.query.resourceId);
    const status     = asString(req.query.status);

    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return void res.status(400).json({ error: 'date doit être YYYY-MM-DD' });
    }
    if (status && !STATUSES.includes(status as typeof STATUSES[number])) {
      return void res.status(400).json({ error: 'status invalide' });
    }

    const result = await reservationService.listClubReservations({
      clubId:     req.membership!.clubId,
      date:       date || undefined,
      resourceId: resourceId || undefined,
      status:     (status || undefined) as typeof STATUSES[number] | undefined,
    });
    res.json(result);
  } catch (err) { handleError(err, res, next); }
});

router.delete('/reservations/:id', async (req: ClubScopedRequest, res: Response, next: NextFunction) => {
  try {
    const cancelled = await reservationService.adminCancelReservation(
      asString(req.params.id), req.membership!.clubId,
    );
    res.json(cancelled);
  } catch (err) { handleError(err, res, next); }
});

// Change le type d'une réservation (Terrain/Coaching/Tournoi/Événement).
router.patch('/reservations/:id', async (req: ClubScopedRequest, res: Response, next: NextFunction) => {
  try {
    const type = asString(req.body.type);
    if (!RESERVATION_TYPES.includes(type as typeof RESERVATION_TYPES[number])) {
      return void res.status(400).json({ error: 'type invalide' });
    }
    const updated = await reservationService.setReservationType(
      asString(req.params.id), req.membership!.clubId, type as typeof RESERVATION_TYPES[number],
    );
    res.json(updated);
  } catch (err) { handleError(err, res, next); }
});

// Encaissement manuel sur une réservation.
router.post('/reservations/:id/payments', async (req: ClubScopedRequest, res: Response, next: NextFunction) => {
  try {
    const { amount, method, payerName, note } = req.body;
    const payment = await reservationService.addPayment({
      reservationId: asString(req.params.id),
      clubId: req.membership!.clubId,
      amount: Number(amount),
      method, payerName, note,
    });
    res.status(201).json(payment);
  } catch (err) { handleError(err, res, next); }
});

// --- Annonces ---
router.get('/announcements', async (req: ClubScopedRequest, res: Response, next: NextFunction) => {
  try { res.json(await announcementService.listAdmin(req.membership!.clubId)); } catch (e) { handleError(e, res, next); }
});
router.post('/announcements', async (req: ClubScopedRequest, res: Response, next: NextFunction) => {
  try { res.status(201).json(await announcementService.create(req.membership!.clubId, req.body)); } catch (e) { handleError(e, res, next); }
});
router.patch('/announcements/:id', async (req: ClubScopedRequest, res: Response, next: NextFunction) => {
  try { res.json(await announcementService.update(asString(req.params.id), req.membership!.clubId, req.body)); } catch (e) { handleError(e, res, next); }
});
router.delete('/announcements/:id', async (req: ClubScopedRequest, res: Response, next: NextFunction) => {
  try { await announcementService.remove(asString(req.params.id), req.membership!.clubId); res.json({ ok: true }); } catch (e) { handleError(e, res, next); }
});

// --- Sponsors ---
router.get('/sponsors', async (req: ClubScopedRequest, res: Response, next: NextFunction) => {
  try { res.json(await sponsorService.listAdmin(req.membership!.clubId)); } catch (e) { handleError(e, res, next); }
});
router.post('/sponsors', async (req: ClubScopedRequest, res: Response, next: NextFunction) => {
  try { res.status(201).json(await sponsorService.create(req.membership!.clubId, req.body)); } catch (e) { handleError(e, res, next); }
});
router.patch('/sponsors/:id', async (req: ClubScopedRequest, res: Response, next: NextFunction) => {
  try { res.json(await sponsorService.update(asString(req.params.id), req.membership!.clubId, req.body)); } catch (e) { handleError(e, res, next); }
});
router.delete('/sponsors/:id', async (req: ClubScopedRequest, res: Response, next: NextFunction) => {
  try { await sponsorService.remove(asString(req.params.id), req.membership!.clubId); res.json({ ok: true }); } catch (e) { handleError(e, res, next); }
});

export default router;
