import { hashPassword, verifyPassword } from '../src/modules/sales/auth/password';
import { sign, verify } from '../src/modules/sales/auth/token';

describe('auth primitives', () => {
  it('round-trips a password and rejects the wrong one', () => {
    const stored = hashPassword('correct horse');
    expect(verifyPassword('correct horse', stored)).toBe(true);
    expect(verifyPassword('wrong horse', stored)).toBe(false);
  });

  it('round-trips a token and rejects a tampered one', () => {
    const token = sign({ sub: 'u1', role: 'SALES_REP', customerId: null, typ: 'access' }, 60);
    expect(verify(token)?.sub).toBe('u1');
    expect(verify(token.slice(0, -2) + 'xx')).toBeNull();
  });

  it('rejects an expired token', () => {
    expect(verify(sign({ sub: 'u1', role: 'SALES_REP', customerId: null, typ: 'access' }, -1))).toBeNull();
  });
});
