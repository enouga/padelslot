import '../../__mocks__/prisma';
import { prismaMock } from '../../__mocks__/prisma';
import { EventService } from '../event.service';

const FUTURE = new Date(Date.now() + 86_400_000); // +24h

function event(overrides: Record<string, unknown> = {}) {
  return { id: 'e1', clubId: 'club-demo', status: 'PUBLISHED', registrationDeadline: FUTURE, capacity: 12, memberOnly: true, ...overrides };
}

/** Chemin nominal : membre ACTIVE, transaction passthrough, pas d'inscription existante. */
function mockHappyPath() {
  prismaMock.clubMembership.findUnique.mockResolvedValue({ status: 'ACTIVE' } as any);
  prismaMock.$transaction.mockImplementation(async (cb: any) => cb(prismaMock));
  prismaMock.$queryRaw.mockResolvedValue([] as any);
  prismaMock.eventRegistration.findUnique.mockResolvedValue(null as any);
}

describe('EventService.register', () => {
  let service: EventService;
  beforeEach(() => { service = new EventService(); });

  it('crée une inscription CONFIRMED quand il reste des places', async () => {
    prismaMock.clubEvent.findUnique.mockResolvedValue(event({ capacity: 12 }) as any);
    mockHappyPath();
    prismaMock.eventRegistration.count.mockResolvedValue(3 as any);
    prismaMock.eventRegistration.create.mockResolvedValue({ id: 'r1', status: 'CONFIRMED' } as any);

    const result = await service.register('e1', 'user-1');

    expect(prismaMock.eventRegistration.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ eventId: 'e1', userId: 'user-1', status: 'CONFIRMED' }) }),
    );
    expect(result.status).toBe('CONFIRMED');
  });

  it('place en WAITLISTED quand l événement est complet', async () => {
    prismaMock.clubEvent.findUnique.mockResolvedValue(event({ capacity: 12 }) as any);
    mockHappyPath();
    prismaMock.eventRegistration.count.mockResolvedValue(12 as any);
    prismaMock.eventRegistration.create.mockResolvedValue({ id: 'r1', status: 'WAITLISTED' } as any);

    await service.register('e1', 'user-1');

    expect(prismaMock.eventRegistration.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'WAITLISTED' }) }),
    );
  });

  it('CONFIRMED sans limite de places (capacity null)', async () => {
    prismaMock.clubEvent.findUnique.mockResolvedValue(event({ capacity: null }) as any);
    mockHappyPath();
    prismaMock.eventRegistration.count.mockResolvedValue(999 as any);
    prismaMock.eventRegistration.create.mockResolvedValue({ id: 'r1', status: 'CONFIRMED' } as any);

    await service.register('e1', 'user-1');

    expect(prismaMock.eventRegistration.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'CONFIRMED' }) }),
    );
  });

  it('réinscription après annulation : met à jour la ligne, createdAt repart à maintenant', async () => {
    prismaMock.clubEvent.findUnique.mockResolvedValue(event() as any);
    mockHappyPath();
    prismaMock.eventRegistration.findUnique.mockResolvedValue({ id: 'r-old', status: 'CANCELLED' } as any);
    prismaMock.eventRegistration.count.mockResolvedValue(0 as any);
    prismaMock.eventRegistration.update.mockResolvedValue({ id: 'r-old', status: 'CONFIRMED' } as any);

    await service.register('e1', 'user-1');

    expect(prismaMock.eventRegistration.create).not.toHaveBeenCalled();
    expect(prismaMock.eventRegistration.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'r-old' },
      data: expect.objectContaining({ status: 'CONFIRMED', cancelledAt: null, createdAt: expect.any(Date) }),
    }));
  });

  it('lève ALREADY_REGISTERED si une inscription active existe', async () => {
    prismaMock.clubEvent.findUnique.mockResolvedValue(event() as any);
    mockHappyPath();
    prismaMock.eventRegistration.findUnique.mockResolvedValue({ id: 'r1', status: 'WAITLISTED' } as any);
    await expect(service.register('e1', 'user-1')).rejects.toThrow('ALREADY_REGISTERED');
  });

  it('lève EVENT_NOT_OPEN si DRAFT', async () => {
    prismaMock.clubEvent.findUnique.mockResolvedValue(event({ status: 'DRAFT' }) as any);
    await expect(service.register('e1', 'user-1')).rejects.toThrow('EVENT_NOT_OPEN');
  });

  it('lève REGISTRATION_CLOSED après la deadline', async () => {
    prismaMock.clubEvent.findUnique.mockResolvedValue(event({ registrationDeadline: new Date(Date.now() - 1000) }) as any);
    await expect(service.register('e1', 'user-1')).rejects.toThrow('REGISTRATION_CLOSED');
  });

  it('lève EVENT_NOT_FOUND si inconnu', async () => {
    prismaMock.clubEvent.findUnique.mockResolvedValue(null as any);
    await expect(service.register('ghost', 'user-1')).rejects.toThrow('EVENT_NOT_FOUND');
  });

  it('memberOnly : lève MEMBERSHIP_REQUIRED pour un non-membre', async () => {
    prismaMock.clubEvent.findUnique.mockResolvedValue(event({ memberOnly: true }) as any);
    prismaMock.clubMembership.findUnique.mockResolvedValue(null as any);
    await expect(service.register('e1', 'user-1')).rejects.toThrow('MEMBERSHIP_REQUIRED');
  });

  it('événement ouvert : un non-membre peut s inscrire', async () => {
    prismaMock.clubEvent.findUnique.mockResolvedValue(event({ memberOnly: false }) as any);
    prismaMock.clubMembership.findUnique.mockResolvedValue(null as any);
    prismaMock.$transaction.mockImplementation(async (cb: any) => cb(prismaMock));
    prismaMock.$queryRaw.mockResolvedValue([] as any);
    prismaMock.eventRegistration.findUnique.mockResolvedValue(null as any);
    prismaMock.eventRegistration.count.mockResolvedValue(0 as any);
    prismaMock.eventRegistration.create.mockResolvedValue({ id: 'r1', status: 'CONFIRMED' } as any);

    await expect(service.register('e1', 'user-1')).resolves.toMatchObject({ status: 'CONFIRMED' });
  });

  it('un membre BLOCKED est refusé même sur un événement ouvert', async () => {
    prismaMock.clubEvent.findUnique.mockResolvedValue(event({ memberOnly: false }) as any);
    prismaMock.clubMembership.findUnique.mockResolvedValue({ status: 'BLOCKED' } as any);
    await expect(service.register('e1', 'user-1')).rejects.toThrow('MEMBERSHIP_BLOCKED');
  });
});

describe('EventService.cancelRegistration', () => {
  let service: EventService;
  beforeEach(() => {
    service = new EventService();
    prismaMock.$transaction.mockImplementation(async (cb: any) => cb(prismaMock));
    prismaMock.$queryRaw.mockResolvedValue([] as any);
  });

  it('annule une inscription CONFIRMED et promeut le 1er WAITLISTED', async () => {
    prismaMock.clubEvent.findUnique.mockResolvedValue(event() as any);
    prismaMock.eventRegistration.findFirst
      .mockResolvedValueOnce({ id: 'r1', status: 'CONFIRMED' } as any)   // ma ligne active
      .mockResolvedValueOnce({ id: 'r-wait' } as any);                   // 1er en attente
    prismaMock.eventRegistration.update.mockResolvedValue({ id: 'r1', status: 'CANCELLED' } as any);

    await service.cancelRegistration('e1', 'user-1');

    expect(prismaMock.eventRegistration.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'r1' }, data: expect.objectContaining({ status: 'CANCELLED' }),
    }));
    expect(prismaMock.eventRegistration.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'r-wait' }, data: { status: 'CONFIRMED' },
    }));
  });

  it('annule une WAITLISTED sans promotion', async () => {
    prismaMock.clubEvent.findUnique.mockResolvedValue(event() as any);
    prismaMock.eventRegistration.findFirst.mockResolvedValueOnce({ id: 'r1', status: 'WAITLISTED' } as any);
    prismaMock.eventRegistration.update.mockResolvedValue({ id: 'r1', status: 'CANCELLED' } as any);

    await service.cancelRegistration('e1', 'user-1');

    expect(prismaMock.eventRegistration.update).toHaveBeenCalledTimes(1);
  });

  it('lève REGISTRATION_LOCKED après la deadline', async () => {
    prismaMock.clubEvent.findUnique.mockResolvedValue(event({ registrationDeadline: new Date(Date.now() - 1000) }) as any);
    await expect(service.cancelRegistration('e1', 'user-1')).rejects.toThrow('REGISTRATION_LOCKED');
  });

  it('lève REGISTRATION_NOT_FOUND sans inscription active', async () => {
    prismaMock.clubEvent.findUnique.mockResolvedValue(event() as any);
    prismaMock.eventRegistration.findFirst.mockResolvedValue(null as any);
    await expect(service.cancelRegistration('e1', 'user-1')).rejects.toThrow('REGISTRATION_NOT_FOUND');
  });
});

describe('EventService lectures', () => {
  let service: EventService;
  beforeEach(() => { service = new EventService(); });

  it('listPublicByClubSlug : PUBLISHED seulement, avec compteurs', async () => {
    prismaMock.club.findUnique.mockResolvedValue({ id: 'club-demo', status: 'ACTIVE' } as any);
    prismaMock.clubEvent.findMany.mockResolvedValue([{ id: 'e1' }, { id: 'e2' }] as any);
    (prismaMock.eventRegistration.groupBy as jest.Mock).mockResolvedValue([
      { eventId: 'e1', status: 'CONFIRMED', _count: { _all: 4 } },
      { eventId: 'e1', status: 'WAITLISTED', _count: { _all: 2 } },
    ] as any);

    const out = await service.listPublicByClubSlug('club-demo');

    expect(prismaMock.clubEvent.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { clubId: 'club-demo', status: 'PUBLISHED' },
    }));
    expect(out[0]).toMatchObject({ id: 'e1', confirmedCount: 4, waitlistCount: 2 });
    expect(out[1]).toMatchObject({ id: 'e2', confirmedCount: 0, waitlistCount: 0 });
  });

  it('getById : masque les DRAFT', async () => {
    prismaMock.clubEvent.findUnique.mockResolvedValue({ id: 'e1', status: 'DRAFT' } as any);
    await expect(service.getById('e1')).rejects.toThrow('EVENT_NOT_FOUND');
  });

  it('listParticipants : masque les DRAFT', async () => {
    prismaMock.clubEvent.findUnique.mockResolvedValue({ status: 'DRAFT' } as any);
    await expect(service.listParticipants('e1')).rejects.toThrow('EVENT_NOT_FOUND');
  });

  it('listParticipants : inscrits actifs (noms + avatar, jamais l e-mail)', async () => {
    prismaMock.clubEvent.findUnique.mockResolvedValue({ status: 'PUBLISHED' } as any);
    prismaMock.eventRegistration.findMany.mockResolvedValue([
      { id: 'r1', status: 'CONFIRMED', user: { firstName: 'A', lastName: 'A', avatarUrl: '/uploads/avatars/a.jpg' } },
    ] as any);
    const out = await service.listParticipants('e1');
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ status: 'CONFIRMED', user: { firstName: 'A', avatarUrl: '/uploads/avatars/a.jpg' } });
    const args = (prismaMock.eventRegistration.findMany.mock.calls[0][0] as any);
    expect(args.select.user.select).toEqual({ firstName: true, lastName: true, avatarUrl: true });
    expect(args.orderBy).toEqual([{ status: 'asc' }, { createdAt: 'asc' }]);
  });

  it('listUserRegistrations : inscriptions actives avec event + club', async () => {
    prismaMock.eventRegistration.findMany.mockResolvedValue([{ id: 'r1', status: 'CONFIRMED' }] as any);
    const out = await service.listUserRegistrations('user-1');
    expect(prismaMock.eventRegistration.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: 'user-1', status: { not: 'CANCELLED' } },
    }));
    expect(out).toHaveLength(1);
  });
});

describe('EventService admin', () => {
  let service: EventService;
  beforeEach(() => { service = new EventService(); });

  const validInput = {
    name: 'Mêlée du vendredi', kind: 'MELEE' as const,
    startTime: FUTURE.toISOString(), registrationDeadline: FUTURE.toISOString(),
    capacity: 12, price: 10, memberOnly: true,
  };

  it('createEvent : crée avec les champs normalisés', async () => {
    prismaMock.clubEvent.create.mockResolvedValue({ id: 'e1' } as any);
    await service.createEvent('club-demo', validInput);
    expect(prismaMock.clubEvent.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ clubId: 'club-demo', name: 'Mêlée du vendredi', kind: 'MELEE', capacity: 12, memberOnly: true }),
    }));
  });

  it('createEvent : refuse un kind inconnu', async () => {
    await expect(service.createEvent('club-demo', { ...validInput, kind: 'KARAOKE' as never }))
      .rejects.toThrow('VALIDATION_ERROR');
  });

  it('createEvent : refuse capacity < 1 et price < 0', async () => {
    await expect(service.createEvent('club-demo', { ...validInput, capacity: 0 })).rejects.toThrow('VALIDATION_ERROR');
    await expect(service.createEvent('club-demo', { ...validInput, price: -1 })).rejects.toThrow('VALIDATION_ERROR');
  });

  it('updateEvent : refuse un event d un autre club', async () => {
    prismaMock.clubEvent.findFirst.mockResolvedValue(null as any);
    await expect(service.updateEvent('e1', 'autre-club', { name: 'X' })).rejects.toThrow('EVENT_NOT_FOUND');
  });

  it('deleteEvent : refuse s il reste des inscriptions actives', async () => {
    prismaMock.clubEvent.findFirst.mockResolvedValue({ id: 'e1' } as any);
    prismaMock.eventRegistration.count.mockResolvedValue(3 as any);
    await expect(service.deleteEvent('e1', 'club-demo')).rejects.toThrow('HAS_REGISTRATIONS');
  });

  it('adminRemoveRegistration : annule et promeut sous verrou', async () => {
    prismaMock.eventRegistration.findFirst
      .mockResolvedValueOnce({ id: 'r1', status: 'CONFIRMED' } as any)  // appartenance au club
      .mockResolvedValueOnce({ id: 'r1', status: 'CONFIRMED' } as any)  // relecture sous verrou
      .mockResolvedValueOnce(null as any);                              // pas de WAITLISTED
    prismaMock.$transaction.mockImplementation(async (cb: any) => cb(prismaMock));
    prismaMock.$queryRaw.mockResolvedValue([] as any);
    prismaMock.eventRegistration.update.mockResolvedValue({ id: 'r1', status: 'CANCELLED' } as any);

    const out = await service.adminRemoveRegistration('e1', 'r1', 'club-demo');
    expect(out.status).toBe('CANCELLED');
  });
});
