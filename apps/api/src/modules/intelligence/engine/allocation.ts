import { money } from '@dealflow/contracts';
import type { AllocationPlan } from '@dealflow/contracts';

export type StockRow = {
  warehouseId: string;
  warehouseName: string;
  productId: string;
  /** onHand minus reserved. Derived by the caller, never stored. */
  available: number;
  shippingBaseMinor: number;
  shippingPerUnitMinor: number;
  currency: string;
};

export type Demand = { productId: string; qty: number };

/**
 * Fewest shipments first, cheapest shipping as the tie-break. A warehouse that can
 * cover a whole product line wins over two that each cover half, because a second
 * shipment costs the customer a second delivery, not just a second base fee.
 * Recommends only; nothing is reserved here.
 * ponytail: greedy per product, exact multi-product bin packing if the demo needs it.
 */
export function planAllocation(demand: Demand[], stock: StockRow[]): AllocationPlan {
  const picked: { warehouseId: string; warehouseName: string; productId: string; qty: number }[] = [];
  const backorder: { productId: string; qty: number }[] = [];
  const remaining = new Map(stock.map((s) => [`${s.warehouseId}:${s.productId}`, s.available]));

  for (const d of demand) {
    let left = d.qty;
    const options = stock
      .filter((s) => s.productId === d.productId)
      .sort((a, b) => {
        const av = remaining.get(`${a.warehouseId}:${a.productId}`) ?? 0;
        const bv = remaining.get(`${b.warehouseId}:${b.productId}`) ?? 0;
        const aCovers = Math.min(av, d.qty);
        const bCovers = Math.min(bv, d.qty);
        if (aCovers !== bCovers) return bCovers - aCovers;
        return (
          a.shippingBaseMinor + a.shippingPerUnitMinor * aCovers -
          (b.shippingBaseMinor + b.shippingPerUnitMinor * bCovers)
        );
      });

    for (const o of options) {
      if (left <= 0) break;
      const key = `${o.warehouseId}:${o.productId}`;
      const avail = remaining.get(key) ?? 0;
      const take = Math.min(avail, left);
      if (take <= 0) continue;
      remaining.set(key, avail - take);
      picked.push({
        warehouseId: o.warehouseId,
        warehouseName: o.warehouseName,
        productId: o.productId,
        qty: take,
      });
      left -= take;
    }
    if (left > 0) backorder.push({ productId: d.productId, qty: left });
  }

  // One shipment per warehouse, so the base fee is charged once there and the
  // per-unit fee rides on each line.
  const baseCharged = new Set<string>();
  const allocations = picked.map((p) => {
    const rate = stock.find((s) => s.warehouseId === p.warehouseId && s.productId === p.productId)!;
    const base = baseCharged.has(p.warehouseId) ? 0 : rate.shippingBaseMinor;
    baseCharged.add(p.warehouseId);
    return {
      ...p,
      shipments: 1,
      shippingCost: money(base + rate.shippingPerUnitMinor * p.qty, rate.currency),
    };
  });

  return {
    allocations,
    backorder,
    totalShipments: new Set(picked.map((p) => p.warehouseId)).size,
  };
}
