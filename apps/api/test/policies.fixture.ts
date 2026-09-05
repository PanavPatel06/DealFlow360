import type { EngineLine, Policy } from '../src/modules/intelligence/engine/types';

export const GOLD = 'tier_gold';

export const policies: Policy[] = [
  {
    id: 'p_default',
    tierId: GOLD,
    categoryId: null,
    maxDiscountBps: 1200,
    requiresManagerAboveBps: 1200,
    requiresFinanceAboveBps: 2000,
    targetMarginBps: 1500,
    stalledAfterDays: 7,
  },
  {
    id: 'p_services',
    tierId: GOLD,
    categoryId: 'cat_services',
    maxDiscountBps: 1000,
    requiresManagerAboveBps: 1000,
    requiresFinanceAboveBps: 1600,
    targetMarginBps: 1500,
    stalledAfterDays: 7,
  },
];

export const line = (over: Partial<EngineLine> = {}): EngineLine => ({
  id: 'line_1',
  productId: 'prd_1',
  categoryId: 'cat_hardware',
  categoryName: 'Hardware',
  qty: 1,
  unitPriceMinor: 100_000,
  discountBps: 0,
  costMinor: 70_000,
  lineType: 'ONE_TIME',
  ...over,
});
