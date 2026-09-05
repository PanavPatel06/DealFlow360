import { ErrorCode, FulfillmentStatus } from '@dealflow/contracts';
import { DomainError } from './types';
import type { StockLevel } from './types';

/**
 * The only place a fulfillment status changes. Anything not in this table throws,
 * the same way quote-state.service.ts is the only writer of quotations.status.
 */
const TRANSITIONS: Record<FulfillmentStatus, FulfillmentStatus[]> = {
  ORDER_CONFIRMED: [FulfillmentStatus.INVENTORY_RESERVED, FulfillmentStatus.BACKORDERED],
  INVENTORY_RESERVED: [FulfillmentStatus.PICKING, FulfillmentStatus.BACKORDERED],
  PICKING: [FulfillmentStatus.PACKED],
  PACKED: [FulfillmentStatus.SHIPPED],
  SHIPPED: [FulfillmentStatus.DELIVERED],
  DELIVERED: [],
  // A backorder rejoins the chain once stock arrives.
  BACKORDERED: [FulfillmentStatus.INVENTORY_RESERVED],
};

export function assertTransition(from: FulfillmentStatus, to: FulfillmentStatus): void {
  if (!TRANSITIONS[from].includes(to)) {
    throw new DomainError(ErrorCode.QUOTE_INVALID_STATE, 'Invalid fulfillment transition.', {
      from,
      to,
      allowed: TRANSITIONS[from],
    });
  }
}

export const isShipped = (s: FulfillmentStatus): boolean =>
  s === FulfillmentStatus.SHIPPED || s === FulfillmentStatus.DELIVERED;

/** Base cost per shipment plus a per-unit cost, from the warehouse's own rates. */
export const shippingCostMinor = (
  warehouse: Pick<StockLevel, 'shippingBaseMinor' | 'shippingPerUnitMinor'>,
  qty: number,
): number => warehouse.shippingBaseMinor + warehouse.shippingPerUnitMinor * qty;

/**
 * Merge shipments that leave the same warehouse for the same order, which is what
 * POST /fulfillments/:id/consolidate does: one base charge instead of two.
 */
export function consolidate(
  shipments: { warehouseId: string; qty: number; shippingBaseMinor: number; shippingPerUnitMinor: number }[],
): { warehouseId: string; qty: number; shippingMinor: number; merged: number }[] {
  const byWarehouse = new Map<string, typeof shipments>();
  for (const s of shipments) {
    byWarehouse.set(s.warehouseId, [...(byWarehouse.get(s.warehouseId) ?? []), s]);
  }
  return [...byWarehouse.entries()].map(([warehouseId, group]) => {
    const qty = group.reduce((s, g) => s + g.qty, 0);
    return {
      warehouseId,
      qty,
      shippingMinor: shippingCostMinor(group[0], qty),
      merged: group.length,
    };
  });
}
