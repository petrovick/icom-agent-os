import { RateLimiterRedis } from 'rate-limiter-flexible';
import { Request, Response, NextFunction } from 'express';
import { getRedisClient } from '../infra/redis';

const limiter = new RateLimiterRedis({
  storeClient: getRedisClient(),
  keyPrefix: 'rl',
  points: 300,
  duration: 1,
});

export const rateLimit = async (req: Request, res: Response, next: NextFunction) => {
  const key = req.header('x-client-id') ?? req.ip;
  try {
    const remaining = await limiter.consume(key);
    res.setHeader('X-RateLimit-Remaining', remaining.remainingPoints.toString());
    next();
  } catch (err: any) {
    res.setHeader('Retry-After', Math.ceil(err.msBeforeNext / 1000).toString());
    res.status(429).json({
      code: 'RATE_LIMIT',
      message: 'Too many requests',
    });
  }
};
