import '../../__mocks__/prisma';
import { prismaMock } from '../../__mocks__/prisma';
import { requireSuperAdmin } from '../requireSuperAdmin';
import { AuthRequest } from '../auth';
import { Response } from 'express';

function mockRes() {
  const res: Partial<Response> = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res as Response;
}

describe('requireSuperAdmin', () => {
  it('401 si pas de req.user', async () => {
    const res = mockRes();
    const next = jest.fn();
    await requireSuperAdmin({ } as AuthRequest, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('403 si utilisateur introuvable', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null as any);
    const res = mockRes();
    const next = jest.fn();
    await requireSuperAdmin({ user: { id: 'u1', email: 'a@b.fr' } } as AuthRequest, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('403 si isSuperAdmin = false', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ isSuperAdmin: false } as any);
    const res = mockRes();
    const next = jest.fn();
    await requireSuperAdmin({ user: { id: 'u1', email: 'a@b.fr' } } as AuthRequest, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('next() si isSuperAdmin = true', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ isSuperAdmin: true } as any);
    const res = mockRes();
    const next = jest.fn();
    await requireSuperAdmin({ user: { id: 'u1', email: 'a@b.fr' } } as AuthRequest, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });
});
