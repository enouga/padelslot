import '../../__mocks__/prisma';
import { prismaMock } from '../../__mocks__/prisma';
import { SponsorService } from '../sponsor.service';

describe('SponsorService', () => {
  let service: SponsorService;
  beforeEach(() => { service = new SponsorService(); });

  it('create normalise offerText/offerCode (trim, vide → null)', async () => {
    prismaMock.sponsor.create.mockResolvedValue({ id: 's1' } as any);
    await service.create('club-demo', {
      name: 'Babolat', logoUrl: 'https://x/logo.png',
      offerText: '  -10 % raquettes  ', offerCode: '   ',
    });
    expect(prismaMock.sponsor.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ offerText: '-10 % raquettes', offerCode: null }),
    }));
  });

  it('create sans offre → offerText/offerCode null', async () => {
    prismaMock.sponsor.create.mockResolvedValue({ id: 's1' } as any);
    await service.create('club-demo', { name: 'Decathlon', logoUrl: 'https://x/l.png' });
    expect(prismaMock.sponsor.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ offerText: null, offerCode: null }),
    }));
  });

  it('update accepte offerText/offerCode et permet de les effacer', async () => {
    prismaMock.sponsor.findUnique.mockResolvedValue({ clubId: 'club-demo' } as any);
    prismaMock.sponsor.update.mockResolvedValue({ id: 's1' } as any);
    await service.update('s1', 'club-demo', { offerText: ' Balles offertes ', offerCode: '' });
    expect(prismaMock.sponsor.update).toHaveBeenCalledWith(expect.objectContaining({
      data: { offerText: 'Balles offertes', offerCode: null },
    }));
  });

  it('update ignore les champs non fournis (pas d écrasement)', async () => {
    prismaMock.sponsor.findUnique.mockResolvedValue({ clubId: 'club-demo' } as any);
    prismaMock.sponsor.update.mockResolvedValue({ id: 's1' } as any);
    await service.update('s1', 'club-demo', { name: 'Babolat Pro' });
    expect(prismaMock.sponsor.update).toHaveBeenCalledWith(expect.objectContaining({
      data: { name: 'Babolat Pro' },
    }));
  });

  it('update rejette SPONSOR_NOT_FOUND si le sponsor est d un autre club', async () => {
    prismaMock.sponsor.findUnique.mockResolvedValue({ clubId: 'autre' } as any);
    await expect(service.update('s1', 'club-demo', { offerText: 'x' })).rejects.toThrow('SPONSOR_NOT_FOUND');
  });

  it('create rejette VALIDATION_ERROR si name ou logoUrl manquant', async () => {
    await expect(service.create('club-demo', { name: '', logoUrl: 'https://x/l.png' })).rejects.toThrow('VALIDATION_ERROR');
    await expect(service.create('club-demo', { name: 'Babolat' })).rejects.toThrow('VALIDATION_ERROR');
    expect(prismaMock.sponsor.create).not.toHaveBeenCalled();
  });

  it('create : offerUntil YYYY-MM-DD → fin de journée UTC, pinned posé', async () => {
    prismaMock.sponsor.create.mockResolvedValue({ id: 's1' } as any);
    await service.create('club-demo', {
      name: 'Babolat', logoUrl: 'https://x/l.png', offerUntil: '2026-06-30', pinned: true,
    });
    expect(prismaMock.sponsor.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ offerUntil: new Date('2026-06-30T23:59:59.999Z'), pinned: true }),
    }));
  });

  it('create sans offerUntil/pinned → null et false', async () => {
    prismaMock.sponsor.create.mockResolvedValue({ id: 's1' } as any);
    await service.create('club-demo', { name: 'Decathlon', logoUrl: 'https://x/l.png' });
    expect(prismaMock.sponsor.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ offerUntil: null, pinned: false }),
    }));
  });

  it('update : offerUntil vide → null, date invalide → VALIDATION_ERROR', async () => {
    prismaMock.sponsor.findUnique.mockResolvedValue({ clubId: 'club-demo' } as any);
    prismaMock.sponsor.update.mockResolvedValue({ id: 's1' } as any);
    await service.update('s1', 'club-demo', { offerUntil: '', pinned: false });
    expect(prismaMock.sponsor.update).toHaveBeenCalledWith(expect.objectContaining({
      data: { offerUntil: null, pinned: false },
    }));
    await expect(service.update('s1', 'club-demo', { offerUntil: 'pas-une-date' })).rejects.toThrow('VALIDATION_ERROR');
  });

  it('listPublic : épinglé d abord puis sortOrder', async () => {
    prismaMock.club.findUnique.mockResolvedValue({ id: 'club-demo', status: 'ACTIVE' } as any);
    prismaMock.sponsor.findMany.mockResolvedValue([] as any);
    await service.listPublic('demo');
    expect(prismaMock.sponsor.findMany).toHaveBeenCalledWith(expect.objectContaining({
      orderBy: [{ pinned: 'desc' }, { sortOrder: 'asc' }],
    }));
  });
});
