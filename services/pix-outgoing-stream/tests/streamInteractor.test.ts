import { describe, expect, test, vi } from 'vitest';
import { StreamInteractor } from '../src/interactors/streamInteractor';
import { XmlBatchBuilder } from '../src/xml/batchBuilder';

const baseDeps = {
  cursorService: {
    issueToken: vi.fn(async () => 'token-123'),
    verify: vi.fn(() => ({ ispb: '12345678', thread: 0 })),
  },
  threadSlotManager: {
    reserve: vi.fn(async () => 0),
    release: vi.fn(async () => undefined),
  },
  xmlBatchBuilder: new XmlBatchBuilder(),
  streamRepository: {
    latest: vi.fn(async () => ({
      messages: ['<PixMessage>demo</PixMessage>'],
      cursor_seq: BigInt(1),
      stream_id: 'uuid-1',
    })),
  },
  region: 'sa-east-1',
};

describe('StreamInteractor', () => {
  test('returns 204 when there are no messages', async () => {
    const deps = {
      ...baseDeps,
      streamRepository: { latest: vi.fn(async () => null) },
    };
    const interactor = new StreamInteractor(deps as any);
    const response = await interactor.start({ ispb: '12345678', clientId: 'client-1' });
    expect(response.status).toBe(204);
  });

  test('returns 429 when thread slots exhausted', async () => {
    const deps = {
      ...baseDeps,
      threadSlotManager: { reserve: vi.fn(async () => null), release: vi.fn() },
    };
    const interactor = new StreamInteractor(deps as any);
    const response = await interactor.start({ ispb: '12345678', clientId: 'client-1' });
    expect(response.status).toBe(429);
  });

  test('start returns XML batch and token', async () => {
    const interactor = new StreamInteractor(baseDeps as any);
    const response = await interactor.start({ ispb: '12345678', clientId: 'client-1' });
    expect(response.status).toBe(200);
    expect(response.headers['pi-pull-next']).toBe('token-123');
    expect(response.headers['Content-Type']).toContain('multipart/mixed');
    expect(response.body).toContain('PixMessage');
  });

  test('next fails on invalid token', async () => {
    const deps = {
      ...baseDeps,
      cursorService: { issueToken: vi.fn(async () => 'token-123'), verify: vi.fn(() => { throw new Error('bad'); }) },
    };
    const interactor = new StreamInteractor(deps as any);
    const response = await interactor.next({ ispb: '12345678', piPullNext: 'bad', clientId: 'client-1' });
    expect(response.status).toBe(400);
  });
});
