import type { ApprovalRole, LineType, RiskLevel } from '@dealflow/contracts';

/** A quote line, reduced to what the engines actually read. */
export type EngineLine = {
  id: string;
  productId: string;
  categoryId: string;
  categoryName: string;
  qty: number;
  unitPriceMinor: number;
  discountBps: number;
  costMinor: number;
  lineType: LineType;
};

/** One discount_policies row. */
export type Policy = {
  id: string;
  tierId: string;
  categoryId: string | null;
  maxDiscountBps: number;
  requiresManagerAboveBps: number;
  requiresFinanceAboveBps: number;
  targetMarginBps: number;
  stalledAfterDays: number;
};

export type { ApprovalRole, RiskLevel };
