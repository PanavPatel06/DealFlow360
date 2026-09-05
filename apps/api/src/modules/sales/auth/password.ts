import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

/** scrypt from node:crypto. No bcrypt dependency for what stdlib already does. */
export const hashPassword = (plain: string): string => {
  const salt = randomBytes(16);
  return `${salt.toString('hex')}:${scryptSync(plain, salt, 64).toString('hex')}`;
};

export const verifyPassword = (plain: string, stored: string): boolean => {
  const [saltHex, hashHex] = stored.split(':');
  if (!saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = scryptSync(plain, Buffer.from(saltHex, 'hex'), expected.length);
  return timingSafeEqual(actual, expected);
};
