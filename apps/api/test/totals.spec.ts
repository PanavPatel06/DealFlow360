import { computeTotals, lineTotalMinor } from '../src/modules/sales/totals';

const line = (qty: number, unitPriceMinor: number, discountBps: number, costMinor = 0) => ({
  qty,
  unitPriceMinor,
  discountBps,
  costMinor,
});

describe('quote totals', () => {
  it('discounts a line in minor units, never a float', () => {
    // 24 laptops at 1200.00 with 12% off
    expect(lineTotalMinor(line(24, 120000, 1200))).toBe(2534400);
  });

  it('rounds a half-minor-unit discount rather than carrying a fraction', () => {
    expect(lineTotalMinor(line(1, 45000, 1833))).toBe(45000 - 8249); // 8248.5 rounds up
  });

  it('adds lines, tax and margin across the quote', () => {
    const t = computeTotals([line(24, 120000, 1200, 90000), line(1, 45000, 1800, 20000)], 1800);
    expect(t.subtotalMinor).toBe(24 * 120000 + 45000);
    expect(t.discountMinor).toBe(345600 + 8100);
    const net = t.subtotalMinor - t.discountMinor;
    expect(t.taxMinor).toBe(Math.round((net * 1800) / 10000));
    expect(t.totalMinor).toBe(net + t.taxMinor);
    // net 2571300, cost 2180000
    expect(t.marginBps).toBe(Math.round(((net - 2180000) * 10000) / net));
  });

  it('is zero, not NaN, on an empty quote', () => {
    expect(computeTotals([], 1800)).toEqual({
      subtotalMinor: 0,
      discountMinor: 0,
      taxMinor: 0,
      totalMinor: 0,
      marginBps: 0,
    });
  });
});
