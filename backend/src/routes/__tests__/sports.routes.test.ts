import '../../__mocks__/prisma';
import { prismaMock } from '../../__mocks__/prisma';
import request from 'supertest';
import app from '../../app';

describe('GET /api/sports', () => {
  it('ne renvoie que les sports publiés (where published:true) et expose le champ', async () => {
    prismaMock.sport.findMany.mockResolvedValue([
      { id: 's1', key: 'padel', name: 'Padel', resourceNoun: 'terrain', defaultSlotStepMin: 30, defaultDurationsMin: [90], icon: '🎾', surfaces: [], published: true },
    ] as any);
    const res = await request(app).get('/api/sports');
    expect(res.status).toBe(200);
    const arg = (prismaMock.sport.findMany as jest.Mock).mock.calls[0][0];
    expect(arg.where).toEqual({ published: true });
    expect(arg.select.published).toBe(true);
    expect(res.body[0].published).toBe(true);
  });
});
