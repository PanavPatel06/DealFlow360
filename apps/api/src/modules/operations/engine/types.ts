import { ErrorCode } from '@dealflow/contracts';
import type { LineType } from '@dealflow/contracts';

/**
 * Thrown by every B3 engine. The HTTP filter in shared/** maps code to status via
 * ERROR_HTTP_STATUS, so an engine never knows about HTTP.
 * ponytail: local to B3 until shared/** exists, then move it there and delete this.
 */
export class DomainError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'DomainError';
  }
}

/** One price_list_items row. */
export type PriceRow = {
  priceListId: string;
  productId: string;
  minQty: number;
  unitPriceMinor: number;
};

/** The catalog fallback when no price list covers the product. */
export type CatalogProduct = {
  id: string;
  categoryId: string;
  listPriceMinor: number;
  costMinor: number;
  currency: string;
  lineType: LineType;
  billingIntervalMonths: number | null;
};

/** One tax_rules row. */
export type TaxRule = {
  id: string;
  categoryId: string | null;
  country: string;
  rateBps: number;
};

/** One inventory row joined to its warehouse, reduced to what the engines read. */
export type StockLevel = {
  warehouseId: string;
  warehouseName: string;
  productId: string;
  onHand: number;
  reserved: number;
  shippingBaseMinor: number;
  shippingPerUnitMinor: number;
};

/** An order line, reduced to what billing and fulfillment read. */
export type OrderLine = {
  id: string;
  productId: string;
  description: string;
  qty: number;
  unitPriceMinor: number;
  discountBps: number;
  lineTotalMinor: number;
  lineType: LineType;
  /** null on ONE_TIME lines */
  billingIntervalMonths: number | null;
  categoryId: string;
};
