import { Router, Response, NextFunction } from 'express';
import { authMiddleware } from '../middleware/auth';
import { requireClubMember, ClubScopedRequest } from '../middleware/requireClubMember';
import { ResourceService } from '../services/resource.service';
import { ReservationService } from '../services/reservation.service';
import { ClubService } from '../services/club.service';

// mergeParams pour accéder à :clubId défini sur le point de montage.
const router = Router({ mergeParams: true });
const resourceService = new ResourceService();
const reservationService = new ReservationService();
const clubService = new ClubService();

const ERROR_STATUS: Record<string, number> = {
  FORBIDDEN:             403,
  RESOURCE_NOT_FOUND:    404,
  CLUB_SPORT_NOT_FOUND:  404,
  SPORT_NOT_FOUND:       404,
  VALIDATION_ERROR:      400,
  CLUB_MISMATCH:         403,
  RESERVATION_NOT_FOUND: 404,
  ALREADY_CANCELLED:     409,
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

// --- Ressources ---

router.get('/resources', async (req: ClubScopedRequest, res: Response, next: NextFunction) => {
  try {
    res.json(await resourceService.listClubResources(req.membership!.clubId));
  } catch (err) { handleError(err, res, next); }
});

router.post('/resources', async (req: ClubScopedRequest, res: Response, next: NextFunction) => {
  try {
    const { clubSportId, name, attributes, pricePerHour, openHour, closeHour } = req.body;
    if (!clubSportId) return void res.status(400).json({ error: 'clubSportId requis' });
    const resource = await resourceService.createResource({
      clubId: req.membership!.clubId, clubSportId, name, attributes, pricePerHour, openHour, closeHour,
    });
    res.status(201).json(resource);
  } catch (err) { handleError(err, res, next); }
});

router.patch('/resources/:id', async (req: ClubScopedRequest, res: Response, next: NextFunction) => {
  try {
    const { name, attributes, pricePerHour, openHour, closeHour } = req.body;
    const resource = await resourceService.updateResource(asString(req.params.id), req.membership!.clubId, {
      name, attributes, pricePerHour, openHour, closeHour,
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

export default router;
