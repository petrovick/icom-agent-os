import Redis from 'ioredis';
import { getRedisClient } from '../infra/redis';

const SLOT_KEY = (ispb: string) => `thread-slot:${ispb}`;

export class ThreadSlotManager {
  private redis: Redis;

  constructor(redisClient: Redis = getRedisClient()) {
    this.redis = redisClient;
  }

  async reserve(ispb: string, clientId: string, ttlSeconds = 30): Promise<number | null> {
    const key = SLOT_KEY(ispb);
    const pipeline = this.redis.multi();
    pipeline.zremrangebyscore(key, '-inf', Date.now() - ttlSeconds * 1000);
    await pipeline.exec();

    const slots = await this.redis.zrange(key, 0, -1, 'WITHSCORES');
    const active = slots.reduce<string[]>((acc, value, idx) => (idx % 2 === 0 ? [...acc, value] : acc), []);
    if (active.length >= 6) return null;
    const slotNumber = active.length;
    await this.redis.zadd(key, Date.now(), JSON.stringify({ slotNumber, clientId }));
    await this.redis.expire(key, ttlSeconds);
    return slotNumber;
  }

  async release(ispb: string, clientId: string) {
    const key = SLOT_KEY(ispb);
    const members = await this.redis.zrange(key, 0, -1);
    for (const member of members) {
      const parsed = JSON.parse(member) as { slotNumber: number; clientId: string };
      if (parsed.clientId === clientId) {
        await this.redis.zrem(key, member);
        break;
      }
    }
  }
}
