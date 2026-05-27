import Redis from 'ioredis';

export const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  retryStrategy: (times) => Math.min(times * 100, 3000),
  enableOfflineQueue: false,
  lazyConnect: true,
});

redis.on('error', (err) => console.error('[Redis]', err.message));
redis.on('connect', () => console.log('[Redis] Connected'));
