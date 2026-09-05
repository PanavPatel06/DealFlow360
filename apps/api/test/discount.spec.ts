import { blend, checkLines, resolvePolicy, toViolations } from '../src/modules/intelligence/engine/discount';
import { GOLD, line, policies } from './policies.fixture';

describe('discount ceilings', () => {
  it('uses the category ceiling and falls back to the tier default', () => {
    expect(resolvePolicy(policies, GOLD, 'cat_services')!.maxDiscountBps).toBe(1000);
    expect(resolvePolicy(policies, GOLD, 'cat_hardware')!.maxDiscountBps).toBe(1200);
  });

  it('flags a services line against its own ceiling, not the tier default', () => {
    const checks = checkLines(
      [line({ categoryId: 'cat_services', categoryName: 'Services', discountBps: 1100 })],
      policies,
      GOLD,
    );
    expect(toViolations(checks)).toEqual([
      {
        quoteLineId: 'line_1',
        categoryName: 'Services',
        allowedBps: 1000,
        actualBps: 1100,
        excessBps: 100,
      },
    ]);
  });

  it('blends several lines that are each only slightly over', () => {
    const checks = checkLines(
      [
        line({ id: 'a', discountBps: 1400 }),
        line({ id: 'b', discountBps: 1400 }),
        line({ id: 'c', discountBps: 1400 }),
      ],
      policies,
      GOLD,
    );
    const b = blend(checks);
    expect(b.worstLineExcessBps).toBe(200);
    expect(b.weightedExcessBps).toBe(200);
    expect(toViolations(checks)).toHaveLength(3);
  });

  it('weights the blend by line value, so a big clean line dilutes a small dirty one', () => {
    const checks = checkLines(
      [
        line({ id: 'big', qty: 99, discountBps: 0 }),
        line({ id: 'small', qty: 1, discountBps: 2200 }),
      ],
      policies,
      GOLD,
    );
    const b = blend(checks);
    expect(b.worstLineExcessBps).toBe(1000);
    expect(b.weightedExcessBps).toBe(10);
  });

  it('computes margin in bps from integer minor units only', () => {
    const b = blend(checkLines([line({ unitPriceMinor: 100_000, costMinor: 70_000 })], policies, GOLD));
    expect(b.marginBps).toBe(3000);
    expect(Number.isInteger(b.marginBps)).toBe(true);
  });
});
