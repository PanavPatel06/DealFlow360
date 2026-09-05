import { ApprovalRole, RiskLevel } from '@dealflow/contracts';
import { evaluate } from '../src/modules/intelligence/engine/risk';
import { GOLD, line, policies } from './policies.fixture';

describe('risk and approval routing', () => {
  it('auto-approves a clean quote', () => {
    const r = evaluate([line({ discountBps: 500 })], policies, GOLD);
    expect(r.approvalRequired).toBe(false);
    expect(r.requiredApprovals).toEqual([]);
    expect(r.riskLevel).toBe(RiskLevel.LOW);
  });

  it('sends a line over its ceiling to the sales manager', () => {
    const r = evaluate(
      [line({ categoryId: 'cat_services', categoryName: 'Services', discountBps: 1100 })],
      policies,
      GOLD,
    );
    expect(r.requiredApprovals).toEqual([ApprovalRole.SALES_MANAGER]);
    expect(r.riskLevel).toBe(RiskLevel.MEDIUM);
  });

  it('escalates to finance past the finance threshold', () => {
    const r = evaluate([line({ discountBps: 2100 })], policies, GOLD);
    expect(r.requiredApprovals).toEqual([ApprovalRole.SALES_MANAGER, ApprovalRole.FINANCE]);
    expect(r.riskLevel).toBe(RiskLevel.HIGH);
    expect(r.riskScore).toBeGreaterThan(0);
  });

  it('catches an order whose lines are each individually tolerable', () => {
    const lines = Array.from({ length: 5 }, (_, i) => line({ id: `l${i}`, discountBps: 1300 }));
    const r = evaluate(lines, policies, GOLD);
    expect(r.approvalRequired).toBe(true);
    expect(r.violations).toHaveLength(5);
    expect(r.blended.weightedExcessBps).toBe(100);
  });

  it('is deterministic and scores within 0..100', () => {
    const lines = [line({ discountBps: 1900, costMinor: 95_000 })];
    const a = evaluate(lines, policies, GOLD);
    const b = evaluate(lines, policies, GOLD);
    expect(a).toEqual(b);
    expect(a.riskScore).toBeGreaterThanOrEqual(0);
    expect(a.riskScore).toBeLessThanOrEqual(100);
  });

  it('refuses to guess when the tier has no default policy', () => {
    expect(() => evaluate([line()], policies, 'tier_unknown')).toThrow();
  });
});
