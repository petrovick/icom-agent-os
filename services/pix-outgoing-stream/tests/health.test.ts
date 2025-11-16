import request from 'supertest';
import { afterEach, beforeAll, describe, expect, test } from 'vitest';

let app: Awaited<ReturnType<typeof import('../src/app').createApp>>;

beforeAll(async () => {
  process.env.MTLS_REQUIRED = 'false';
  const mod = await import('../src/app');
  app = mod.createApp();
});

afterEach(() => {
  delete process.env.MTLS_REQUIRED;
});

describe('health endpoint', () => {
  test('returns ok when mTLS not required', async () => {
    const response = await request(app).get('/health');
    expect(response.status).toBe(200);
    expect(response.body.status).toBe('ok');
  });

  test('rejects when mTLS required and no certificate', async () => {
    process.env.MTLS_REQUIRED = 'true';
    const response = await request(app).get('/health');
    expect(response.status).toBe(401);
    expect(response.body.code).toBe('UNAUTHORIZED');
  });
});
