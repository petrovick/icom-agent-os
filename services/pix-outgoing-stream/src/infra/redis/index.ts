import Redis from 'ioredis';
import { config } from '../../config';

let redis: Redis | null = null;

const createClient = () => {
  if (process.env.NODE_ENV === 'test') {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const MockRedis = require('ioredis-mock');
    return new MockRedis();
  }
  return new Redis(config.infra.redisUrl);
};

export const getRedisClient = () => {
  if (redis) return redis;
  redis = createClient();
  return redis;
};
