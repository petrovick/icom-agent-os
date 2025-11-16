import { describe, expect, test } from 'vitest';
import { generateToken, verifyToken } from '../src/services/tokenService';

describe('tokenService', () => {
  test('generates and verifies token', () => {
    const token = generateToken({
      ispb: '12345678',
      thread: 1,
      cursorSeq: 10,
      cursorOffset: 'uuid',
      shard: 'sa-east-1:12345678',
      issuedAt: Date.now(),
      exp: Date.now() + 1000,
    });
    const payload = verifyToken(token);
    expect(payload.ispb).toBe('12345678');
    expect(payload.thread).toBe(1);
  });

  test('fails on expired token', () => {
    const token = generateToken({
      ispb: '12345678',
      thread: 1,
      cursorSeq: 10,
      cursorOffset: 'uuid',
      shard: 'sa-east-1:12345678',
      issuedAt: Date.now() - 2000,
      exp: Date.now() - 1000,
    });
    expect(() => verifyToken(token)).toThrow();
  });
});
