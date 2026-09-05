import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * HS256 JWT in twenty lines of node:crypto. A signing library buys nothing here
 * and jwt is a stable format.
 */
export type TokenPayload = {
  sub: string;
  role: string;
  customerId: string | null;
  typ: 'access' | 'refresh';
};

const b64 = (buf: Buffer | string) =>
  Buffer.from(buf).toString('base64url');

const secret = () => process.env.JWT_SECRET ?? 'dev-only-secret';

export function sign(payload: TokenPayload, ttlSeconds: number): string {
  const body = { ...payload, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + ttlSeconds };
  const head = b64(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const data = `${head}.${b64(JSON.stringify(body))}`;
  return `${data}.${b64(createHmac('sha256', secret()).update(data).digest())}`;
}

/** Returns the payload, or null for a bad signature, bad shape or expiry. */
export function verify(token: string): (TokenPayload & { exp: number }) | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const data = `${parts[0]}.${parts[1]}`;
  const expected = createHmac('sha256', secret()).update(data).digest();
  const actual = Buffer.from(parts[2], 'base64url');
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
    if (typeof payload.exp !== 'number' || payload.exp * 1000 < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export const ACCESS_TTL = 60 * 60;
export const REFRESH_TTL = 60 * 60 * 24 * 7;
