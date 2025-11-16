import crypto from 'node:crypto';
import { config } from '../config';

export type TokenPayload = {
  ispb: string;
  thread: number;
  cursorSeq: number;
  cursorOffset: string;
  shard: string;
  exp: number;
  issuedAt: number;
};

const algorithm = 'sha512';

const encode = (payload: TokenPayload) => Buffer.from(JSON.stringify(payload)).toString('base64url');
const decode = (token: string): TokenPayload => JSON.parse(Buffer.from(token, 'base64url').toString('utf-8'));

const sign = (encodedPayload: string) =>
  crypto.createHmac(algorithm, config.security.tokenSecret).update(encodedPayload).digest('base64url');

export const generateToken = (payload: TokenPayload) => {
  const encoded = encode(payload);
  const signature = sign(encoded);
  return `${encoded}.${signature}`;
};

export const verifyToken = (token: string): TokenPayload => {
  const [encoded, providedSignature] = token.split('.');
  if (!encoded || !providedSignature) {
    throw new Error('Malformed token');
  }
  const expected = sign(encoded);
  if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(providedSignature))) {
    throw new Error('Invalid signature');
  }
  const payload = decode(encoded);
  if (payload.exp < Date.now()) {
    throw new Error('Token expired');
  }
  return payload;
};
