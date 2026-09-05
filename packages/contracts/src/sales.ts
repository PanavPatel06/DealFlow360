import type { LineType, QuoteStatus } from './enums';
import type { Money } from './money';

export const UserRole = {
  ADMIN: 'ADMIN',
  SALES_REP: 'SALES_REP',
  SALES_MANAGER: 'SALES_MANAGER',
  FINANCE: 'FINANCE',
  OPS: 'OPS',
  CUSTOMER: 'CUSTOMER',
} as const;
export type UserRole = (typeof UserRole)[keyof typeof UserRole];

export type AuthUser = { id: string; email: string; name: string; role: UserRole; customerId: string | null };
export type AuthTokens = { accessToken: string; refreshToken: string; user: AuthUser };

export type QuoteLineView = {
  id: string;
  productId: string;
  description: string;
  qty: number;
  unitPrice: Money;
  discountBps: number;
  /** from B2, rides on the line so the builder needs no second round trip */
  allowedDiscountBps: number | null;
  overBps: number | null;
  lineTotal: Money;
  lineType: LineType;
};

export type QuoteTotals = { subtotal: Money; discount: Money; tax: Money; total: Money };

export type QuoteView = {
  id: string;
  code: string;
  status: QuoteStatus;
  customer: { id: string; name: string; tier: string };
  lines: QuoteLineView[];
  totals: QuoteTotals;
  marginBps: number;
  validUntil: string | null;
  /** the customer's link. Internal screens only: PortalQuoteView omits it. */
  portalToken: string | null;
  evaluation: { riskScore: number; riskLevel: string; approvalRequired: boolean } | null;
  approval: { status: string; currentStep: string | null } | null;
};

/** What the customer portal is allowed to see. No score, no margin, no cost. */
export type PortalQuoteView = Omit<QuoteView, 'evaluation' | 'approval' | 'marginBps' | 'portalToken'> & {
  approvalPending: boolean;
};

export type OrderView = {
  id: string;
  code: string;
  status: string;
  quotationId: string;
  customer: { id: string; name: string };
  lines: { id: string; productId: string; description: string; qty: number; unitPrice: Money; lineTotal: Money; lineType: LineType }[];
  totals: QuoteTotals;
  createdAt: string;
};
