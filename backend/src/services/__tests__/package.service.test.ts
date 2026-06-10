import '../../__mocks__/prisma';
import { prismaMock } from '../../__mocks__/prisma';
import { PackageService } from '../package.service';

describe('PackageService — offres (templates)', () => {
  let service: PackageService;
  beforeEach(() => { service = new PackageService(); });

  it('crée une offre carnet (ENTRIES) avec entriesCount', async () => {
    prismaMock.packageTemplate.create.mockResolvedValue({ id: 'tpl-1' } as any);
    await service.createTemplate('club-1', { kind: 'ENTRIES', name: '10 entrées', price: 200, entriesCount: 10 });
    expect(prismaMock.packageTemplate.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ clubId: 'club-1', kind: 'ENTRIES', entriesCount: 10, walletAmount: null }),
    }));
  });

  it('crée une offre porte-monnaie (WALLET) avec walletAmount', async () => {
    prismaMock.packageTemplate.create.mockResolvedValue({ id: 'tpl-2' } as any);
    await service.createTemplate('club-1', { kind: 'WALLET', name: 'Avoir 200 €', price: 180, walletAmount: 200, validityDays: 365 });
    expect(prismaMock.packageTemplate.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ kind: 'WALLET', entriesCount: null, validityDays: 365 }),
    }));
  });

  it('refuse un carnet sans entriesCount', async () => {
    await expect(service.createTemplate('club-1', { kind: 'ENTRIES', name: 'x', price: 200 }))
      .rejects.toThrow('VALIDATION_ERROR');
  });

  it('refuse un porte-monnaie sans walletAmount', async () => {
    await expect(service.createTemplate('club-1', { kind: 'WALLET', name: 'x', price: 180 }))
      .rejects.toThrow('VALIDATION_ERROR');
  });

  it('refuse un prix nul ou négatif', async () => {
    await expect(service.createTemplate('club-1', { kind: 'ENTRIES', name: 'x', price: 0, entriesCount: 10 }))
      .rejects.toThrow('VALIDATION_ERROR');
  });

  it('updateTemplate refuse une offre d’un autre club', async () => {
    prismaMock.packageTemplate.findUnique.mockResolvedValue({ id: 'tpl-1', clubId: 'autre-club' } as any);
    await expect(service.updateTemplate('tpl-1', 'club-1', { isActive: false }))
      .rejects.toThrow('TEMPLATE_NOT_FOUND');
  });

  it('updateTemplate ne modifie que name/price/validityDays/isActive', async () => {
    prismaMock.packageTemplate.findUnique.mockResolvedValue({ id: 'tpl-1', clubId: 'club-1' } as any);
    prismaMock.packageTemplate.update.mockResolvedValue({ id: 'tpl-1' } as any);
    await service.updateTemplate('tpl-1', 'club-1', { name: 'Nouveau nom', isActive: false });
    const data = prismaMock.packageTemplate.update.mock.calls[0][0].data as Record<string, unknown>;
    expect(data).not.toHaveProperty('kind');
    expect(data).not.toHaveProperty('entriesCount');
  });
});

describe('PackageService — vente en caisse', () => {
  let service: PackageService;
  beforeEach(() => {
    service = new PackageService();
    prismaMock.$transaction.mockImplementation(async (fn: any) => fn(prismaMock));
  });

  const tplEntries = { id: 'tpl-1', clubId: 'club-1', kind: 'ENTRIES', name: '10 entrées', price: 200, entriesCount: 10, walletAmount: null, validityDays: null, isActive: true };

  it('vend un carnet : crée le MemberPackage + le Payment de vente dans une transaction', async () => {
    prismaMock.packageTemplate.findUnique.mockResolvedValue(tplEntries as any);
    prismaMock.clubMembership.findUnique.mockResolvedValue({ id: 'mb-1' } as any);
    prismaMock.memberPackage.create.mockResolvedValue({ id: 'pkg-1', kind: 'ENTRIES' } as any);
    prismaMock.payment.create.mockResolvedValue({ id: 'pay-1' } as any);

    const out = await service.sellPackage('club-1', 'user-1', { templateId: 'tpl-1', method: 'CARD' });

    expect(prismaMock.memberPackage.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ clubId: 'club-1', userId: 'user-1', creditsTotal: 10, creditsRemaining: 10, amountTotal: null }),
    }));
    expect(prismaMock.payment.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ clubId: 'club-1', memberPackageId: 'pkg-1', method: 'CARD' }),
    }));
    expect(out.package.id).toBe('pkg-1');
  });

  it('vend un porte-monnaie avec expiration : amountRemaining = walletAmount, expiresAt posé', async () => {
    prismaMock.packageTemplate.findUnique.mockResolvedValue({ ...tplEntries, id: 'tpl-2', kind: 'WALLET', entriesCount: null, walletAmount: 200, validityDays: 365 } as any);
    prismaMock.clubMembership.findUnique.mockResolvedValue({ id: 'mb-1' } as any);
    prismaMock.memberPackage.create.mockResolvedValue({ id: 'pkg-2', kind: 'WALLET' } as any);
    prismaMock.payment.create.mockResolvedValue({ id: 'pay-2' } as any);

    await service.sellPackage('club-1', 'user-1', { templateId: 'tpl-2' });

    const data = prismaMock.memberPackage.create.mock.calls[0][0].data as any;
    expect(data.creditsTotal).toBeNull();
    expect(Number(data.amountRemaining)).toBe(200);
    expect(data.expiresAt).toBeInstanceOf(Date);
  });

  it('vente payée en ticket CE : exige voucherRef et pose voucherStatus', async () => {
    prismaMock.packageTemplate.findUnique.mockResolvedValue(tplEntries as any);
    prismaMock.clubMembership.findUnique.mockResolvedValue({ id: 'mb-1' } as any);

    await expect(service.sellPackage('club-1', 'user-1', { templateId: 'tpl-1', method: 'VOUCHER' }))
      .rejects.toThrow('VALIDATION_ERROR');

    prismaMock.memberPackage.create.mockResolvedValue({ id: 'pkg-1' } as any);
    prismaMock.payment.create.mockResolvedValue({ id: 'pay-1' } as any);
    await service.sellPackage('club-1', 'user-1', { templateId: 'tpl-1', method: 'VOUCHER', voucherRef: 'ANCV-123', voucherIssuer: 'ANCV' });
    expect(prismaMock.payment.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ method: 'VOUCHER', voucherRef: 'ANCV-123', voucherStatus: 'PENDING_REIMBURSEMENT' }),
    }));
  });

  it('refuse une offre inactive ou d’un autre club', async () => {
    prismaMock.packageTemplate.findUnique.mockResolvedValue({ ...tplEntries, isActive: false } as any);
    await expect(service.sellPackage('club-1', 'user-1', { templateId: 'tpl-1' }))
      .rejects.toThrow('TEMPLATE_NOT_FOUND');
  });

  it('refuse si l’acheteur n’est pas membre du club', async () => {
    prismaMock.packageTemplate.findUnique.mockResolvedValue(tplEntries as any);
    prismaMock.clubMembership.findUnique.mockResolvedValue(null as any);
    await expect(service.sellPackage('club-1', 'user-1', { templateId: 'tpl-1' }))
      .rejects.toThrow('MEMBER_NOT_FOUND');
  });
});
