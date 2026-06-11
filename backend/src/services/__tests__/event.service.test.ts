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
