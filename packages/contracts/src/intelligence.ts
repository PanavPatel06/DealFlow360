import type { ApprovalRole, DealHealthType, RiskLevel } from './enums';
import type { Money } from './money';

export type DiscountViolation = {
  quoteLineId: string;
  categoryName: string;
  allowedBps: number;
  actualBps: number;
  excessBps: number;
};

export type BlendedDiscount = {
  weightedExcessBps: number;
  worstLineExcessBps: number;
  marginBps: number;
  /** weighted actual discount across the quote, used by the routing thresholds */
  weightedDiscountBps: number;
  worstLineDiscountBps: number;
};

export type EvaluationResult = {
  riskScore: number;
  riskLevel: RiskLevel;
  approvalRequired: boolean;
  requiredApprovals: ApprovalRole[];
  violations: DiscountViolation[];
  blended: BlendedDiscount;
};

export type UpsellSuggestion = {
  productId: string;
  name: string;
  reason: string;
  rank: number;
  score: number;
  unitPrice: Money;
};

export type AllocationLine = {
  warehouseId: string;
  warehouseName: string;
  productId: string;
  qty: number;
  shipments: number;
  shippingCost: Money;
};

export type AllocationPlan = {
  allocations: AllocationLine[];
  backorder: { productId: string; qty: number }[];
  totalShipments: number;
};

export type DealHealthEvent = {
  id: string;
  quotationId: string;
  type: DealHealthType;
  severity: RiskLevel;
  detail: string;
  createdAt: string;
};
