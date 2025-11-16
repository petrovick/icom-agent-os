import { randomUUID } from 'crypto';
import { CursorRepository } from '../repositories/cursorRepository';
import { TokenPayload, generateToken, verifyToken } from './tokenService';

export class CursorService {
  constructor(private readonly repo: CursorRepository) {}

  async issueToken(params: {
    region: string;
    ispb: string;
    threadSlot: number;
    cursorSeq: number;
    cursorOffset: string;
  }) {
    const payload: TokenPayload = {
      ispb: params.ispb,
      thread: params.threadSlot,
      cursorSeq: params.cursorSeq,
      cursorOffset: params.cursorOffset,
      shard: `${params.region}:${params.ispb}`,
      issuedAt: Date.now(),
      exp: Date.now() + 5 * 60 * 1000,
    };
    const piPullNext = generateToken(payload);
    await this.repo.upsert({
      region: params.region,
      ispb: params.ispb,
      threadSlot: params.threadSlot,
      cursorSeq: BigInt(params.cursorSeq),
      cursorOffset: params.cursorOffset,
      tokenHash: piPullNext,
      tokenExpiry: new Date(payload.exp),
      lastHeartbeat: new Date(),
      piPullNextId: randomUUID(),
    });
    return piPullNext;
  }

  verify(piPullNext: string) {
    return verifyToken(piPullNext);
  }
}
