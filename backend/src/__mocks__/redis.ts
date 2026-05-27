export const redisMock = {
  set: jest.fn(),
  del: jest.fn(),
  get: jest.fn(),
  exists: jest.fn(),
  connect: jest.fn(),
  on: jest.fn(),
};

jest.mock('../redis/client', () => ({
  __esModule: true,
  redis: redisMock,
}));

beforeEach(() => {
  Object.values(redisMock).forEach((fn) => (fn as jest.Mock).mockReset());
});
