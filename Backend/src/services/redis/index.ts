import Redis from 'ioredis';
import { config } from '../../config';

export const redis = new Redis(config.redis.url, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  lazyConnect: true,
});

redis.on('error', (err) => {
  console.error('[Redis] Error:', err.message);
});

export async function testRedisConnection(): Promise<void> {
  await redis.ping();
  console.log('[Redis] Connection OK');
}

// ─── Typed helpers ─────────────────────────────────────────────────────────

export async function cacheGet<T>(key: string): Promise<T | null> {
  const val = await redis.get(key);
  if (!val) return null;
  try {
    return JSON.parse(val) as T;
  } catch {
    return null;
  }
}

export async function cacheSet(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  await redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
}

export async function cacheDel(key: string): Promise<void> {
  await redis.del(key);
}

export async function cacheDelPattern(pattern: string): Promise<void> {
  const keys = await redis.keys(pattern);
  if (keys.length > 0) {
    await redis.del(...keys);
  }
}
