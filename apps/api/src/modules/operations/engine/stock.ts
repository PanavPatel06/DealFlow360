import { ErrorCode, MovementKind } from '@dealflow/contracts';
import type { StockRow } from '@dealflow/contracts';
import { DomainError } from './types';
import type { StockLevel } from './types';

/** Derived, never stored. plan.md section 6. */
export const availableQty = (s: Pick<StockLevel, 'onHand' | 'reserved'>): number =>
  s.onHand - s.reserved;

export const toStockRow = (s: StockLevel): StockRow => ({
  warehouseId: s.warehouseId,
  warehouseName: s.warehouseName,
  productId: s.productId,
  onHand: s.onHand,
  reserved: s.reserved,
  available: availableQty(s),
});

export type Allocation = { warehouseId: string; productId: string; qty: number };

/**
 * Check a proposed split against what is actually on the shelf. B2 chooses the
 * split; B3 is the one that refuses it. Several rows for the same warehouse and
 * product are summed first, so a caller cannot slip past the check by splitting
 * one line in two.
 */
export function assertCoverage(allocations: Allocation[], levels: StockLevel[]): void {
  const wanted = new Map<string, number>();
  for (const a of allocations) {
    if (a.qty <= 0) {
      throw new DomainError(ErrorCode.VALIDATION_FAILED, 'Allocation quantity must be positive.', {
        warehouseId: a.warehouseId,
        productId: a.productId,
        qty: a.qty,
      });
    }
    const key = `${a.warehouseId}:${a.productId}`;
    wanted.set(key, (wanted.get(key) ?? 0) + a.qty);
  }
  for (const [key, qty] of wanted) {
    const [warehouseId, productId] = key.split(':');
    const level = levels.find((l) => l.warehouseId === warehouseId && l.productId === productId);
    const available = level ? availableQty(level) : 0;
    if (qty > available) {
      throw new DomainError(ErrorCode.INSUFFICIENT_STOCK, 'Not enough stock to reserve.', {
        warehouseId,
        productId,
        requested: qty,
        available,
      });
    }
  }
}

/**
 * What is still uncovered once every warehouse has given what it can. A non-empty
 * result is a backorder, not an error: the split is accepted and the fulfillment
 * for the missing part is BACKORDERED.
 */
export function backorder(
  demand: { productId: string; qty: number }[],
  levels: StockLevel[],
): { productId: string; qty: number }[] {
  return demand
    .map((d) => {
      const supply = levels
        .filter((l) => l.productId === d.productId)
        .reduce((s, l) => s + availableQty(l), 0);
      return { productId: d.productId, qty: Math.max(0, d.qty - supply) };
    })
    .filter((d) => d.qty > 0);
}

export type Movement = {
  warehouseId: string;
  productId: string;
  kind: MovementKind;
  qty: number;
  refType: string;
  refId: string;
};

/**
 * The rows to append and the reserved deltas to apply, for one step of the
 * inventory lifecycle. Stock is never decremented directly: onHand only moves on
 * SHIP, and reserved carries everything before that.
 */
export function movementsFor(
  kind: MovementKind,
  allocations: Allocation[],
  ref: { type: string; id: string },
): { movements: Movement[]; deltas: { warehouseId: string; productId: string; onHand: number; reserved: number }[] } {
  const delta = (qty: number) => {
    switch (kind) {
      case MovementKind.RESERVE:
        return { onHand: 0, reserved: qty };
      case MovementKind.RELEASE:
        return { onHand: 0, reserved: -qty };
      case MovementKind.SHIP:
        return { onHand: -qty, reserved: -qty };
      case MovementKind.RECEIPT:
        return { onHand: qty, reserved: 0 };
      // ALLOCATE records the pick without moving anything: the stock is already
      // reserved and has not left the building yet.
      case MovementKind.ALLOCATE:
      case MovementKind.ADJUSTMENT:
        return { onHand: 0, reserved: 0 };
    }
  };
  return {
    movements: allocations.map((a) => ({
      warehouseId: a.warehouseId,
      productId: a.productId,
      kind,
      qty: a.qty,
      refType: ref.type,
      refId: ref.id,
    })),
    deltas: allocations.map((a) => ({
      warehouseId: a.warehouseId,
      productId: a.productId,
      ...delta(a.qty),
    })),
  };
}
