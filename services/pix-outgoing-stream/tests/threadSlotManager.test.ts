import Redis from 'ioredis-mock';
import { describe, expect, test } from 'vitest';
import { ThreadSlotManager } from '../src/services/threadSlotManager';

describe('ThreadSlotManager', () => {
  test('reserves slots up to the limit', async () => {
    const redis = new Redis();
    const manager = new ThreadSlotManager(redis as unknown as any);

    const slots = await Promise.all(
      Array.from({ length: 6 }).map((_, idx) => manager.reserve('12345678', `client-${idx}`))
    );
    expect(slots.filter((s) => s !== null)).toHaveLength(6);
    const fail = await manager.reserve('12345678', 'client-7');
    expect(fail).toBeNull();
  });
});
