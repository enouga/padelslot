import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: 'src',
  setupFilesAfterEnv: [
    '<rootDir>/__mocks__/prisma.ts',
    '<rootDir>/__mocks__/redis.ts',
  ],
  testMatch: ['**/__tests__/**/*.test.ts'],
  collectCoverageFrom: ['**/*.ts', '!**/*.d.ts', '!**/__mocks__/**'],
};

export default config;
