import Redis from 'ioredis';
import { config } from '../../config';

let redis: Redis | null = null;

export const getRedisClient = () => {
  if (redis) return redis;
  redis = new Redis(config.infra.redisUrl);
  return redis;
};
