export const QuoteStatus = {
  DRAFT: 'DRAFT',
  SUBMITTED: 'SUBMITTED',
  AUTO_APPROVED: 'AUTO_APPROVED',
  PENDING_MANAGER: 'PENDING_MANAGER',
  PENDING_FINANCE: 'PENDING_FINANCE',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  RETURNED: 'RETURNED',
  CONFIRMED: 'CONFIRMED',
  NEGOTIATING: 'NEGOTIATING',
  FULFILLING: 'FULFILLING',
  COMPLETED: 'COMPLETED',
} as const;
export type QuoteStatus = (typeof QuoteStatus)[keyof typeof QuoteStatus];

export const ApprovalRole = { SALES_MANAGER: 'SALES_MANAGER', FINANCE: 'FINANCE' } as const;
export type ApprovalRole = (typeof ApprovalRole)[keyof typeof ApprovalRole];

export const RiskLevel = { LOW: 'LOW', MEDIUM: 'MEDIUM', HIGH: 'HIGH' } as const;
export type RiskLevel = (typeof RiskLevel)[keyof typeof RiskLevel];

export const ApprovalStatus = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  RETURNED: 'RETURNED',
} as const;
export type ApprovalStatus = (typeof ApprovalStatus)[keyof typeof ApprovalStatus];

export const DealHealthType = {
  STALLED: 'STALLED',
  DISCOUNT_ANOMALY: 'DISCOUNT_ANOMALY',
  DELIVERY_SLIPPAGE: 'DELIVERY_SLIPPAGE',
  LOW_MARGIN: 'LOW_MARGIN',
} as const;
export type DealHealthType = (typeof DealHealthType)[keyof typeof DealHealthType];

export const LineType = { ONE_TIME: 'ONE_TIME', RECURRING: 'RECURRING' } as const;
export type LineType = (typeof LineType)[keyof typeof LineType];
