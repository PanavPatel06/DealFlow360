import type { LineType } from './enums';
import type { Money } from './money';

/**
 * B3's enums. They are not in enums.ts because base.prisma and enums.ts are group
 * owned and nothing outside B3 reads these values. They mirror
 * prisma/schema/operations.prisma and billing.prisma.
 */
export const FulfillmentStatus = {
  ORDER_CONFIRMED: 'ORDER_CONFIRMED',
  INVENTORY_RESERVED: 'INVENTORY_RESERVED',
  PICKING: 'PICKING',
  PACKED: 'PACKED',
  SHIPPED: 'SHIPPED',
  DELIVERED: 'DELIVERED',
  BACKORDERED: 'BACKORDERED',
} as const;
export type FulfillmentStatus = (typeof FulfillmentStatus)[keyof typeof FulfillmentStatus];

export const InvoiceStatus = {
  DRAFT: 'DRAFT',
  ISSUED: 'ISSUED',
  PARTIALLY_PAID: 'PARTIALLY_PAID',
  PAID: 'PAID',
  OVERDUE: 'OVERDUE',
  VOID: 'VOID',
} as const;
export type InvoiceStatus = (typeof InvoiceStatus)[keyof typeof InvoiceStatus];

export const SubscriptionStatus = {
  ACTIVE: 'ACTIVE',
  PAUSED: 'PAUSED',
  CANCELLED: 'CANCELLED',
} as const;
export type SubscriptionStatus = (typeof SubscriptionStatus)[keyof typeof SubscriptionStatus];

export const PaymentMethod = {
  BANK_TRANSFER: 'BANK_TRANSFER',
  CARD: 'CARD',
  UPI: 'UPI',
  CHEQUE: 'CHEQUE',
} as const;
export type PaymentMethod = (typeof PaymentMethod)[keyof typeof PaymentMethod];

export const MovementKind = {
  RECEIPT: 'RECEIPT',
  RESERVE: 'RESERVE',
  RELEASE: 'RELEASE',
  ALLOCATE: 'ALLOCATE',
  SHIP: 'SHIP',
  ADJUSTMENT: 'ADJUSTMENT',
} as const;
export type MovementKind = (typeof MovementKind)[keyof typeof MovementKind];

/** GET /price-lists/:id/resolve */
export type ResolvedPrice = {
  productId: string;
  priceListId: string | null;
  unitPrice: Money;
  /** true when no price list covered the product and the catalog list price was used */
  fromListPrice: boolean;
  appliedMinQty: number;
};

/** GET /inventory */
export type StockRow = {
  warehouseId: string;
  warehouseName: string;
  productId: string;
  onHand: number;
  reserved: number;
  /** derived, never stored */
  available: number;
};

/** POST /orders/:id/fulfillment, and the rows behind GET /fulfillment */
export type FulfillmentView = {
  id: string;
  code: string;
  orderId: string;
  warehouseId: string;
  warehouseName: string;
  status: FulfillmentStatus;
  shipping: Money;
  lines: { productId: string; description: string; qty: number }[];
};

export type InvoiceLineView = {
  id: string;
  productId: string;
  description: string;
  qty: number;
  unitPrice: Money;
  discountBps: number;
  taxBps: number;
  lineTotal: Money;
  lineType: LineType;
};

export type InvoiceView = {
  id: string;
  code: string;
  orderId: string;
  customerId: string;
  subscriptionId: string | null;
  status: InvoiceStatus;
  totals: { subtotal: Money; discount: Money; tax: Money; total: Money; paid: Money; due: Money };
  issuedAt: string | null;
  dueDate: string | null;
  lines: InvoiceLineView[];
};

export type BillingScheduleView = {
  cycleNumber: number;
  dueDate: string;
  amount: Money;
  status: 'SCHEDULED' | 'INVOICED' | 'SKIPPED';
  invoiceId: string | null;
};

export type SubscriptionView = {
  id: string;
  code: string;
  orderId: string;
  customerId: string;
  status: SubscriptionStatus;
  intervalMonths: number;
  cycleAmount: Money;
  startDate: string;
  schedules: BillingScheduleView[];
};

/** POST /portal/quotes/:token/messages, and the thread the sales screen reads. */
export type NegotiationMessageView = {
  id: string;
  author: 'CUSTOMER' | 'SALES';
  body: string;
  quotationLineId: string | null;
  requestedDiscountBps: number | null;
  requestedDeliveryDate: string | null;
  resolution: string | null;
  createdAt: string;
};
