import { mockDeep, mockReset, DeepMockProxy } from 'jest-mock-extended';
import { PrismaClient } from '@prisma/client';

export type Context = { prisma: PrismaClient };
export type MockContext = { prisma: DeepMockProxy<PrismaClient> };

export const prismaMock = mockDeep<PrismaClient>();

jest.mock('../db/prisma', () => ({
  __esModule: true,
  prisma: prismaMock,
}));

beforeEach(() => mockReset(prismaMock));
