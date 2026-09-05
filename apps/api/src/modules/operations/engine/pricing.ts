import type { ResolvedPrice } from '@dealflow/contracts';
import { applyBps, money } from '@dealflow/contracts';
import type { CatalogProduct, PriceRow } from './types';

/**
 * The unit price for a product at a quantity: the highest quantity break at or
 * below qty on the customer's price list, falling back to the catalog list price.
 * Rows for other products or other lists are ignored, so the caller can hand over
 * everything it loaded without filtering first.
 */
export function resolvePrice(
  product: CatalogProduct,
  qty: number,
  rows: PriceRow[],
): ResolvedPrice {
  const candidates = rows
    .filter((r) => r.productId === product.id && r.minQty <= qty)
    .sort((a, b) => b.minQty - a.minQty);
  const hit = candidates[0];
  return hit
    ? {
        productId: product.id,
        priceListId: hit.priceListId,
        unitPrice: money(hit.unitPriceMinor, product.currency),
        fromListPrice: false,
        appliedMinQty: hit.minQty,
      }
    : {
        productId: product.id,
        priceListId: null,
        unitPrice: money(product.listPriceMinor, product.currency),
        fromListPrice: true,
        appliedMinQty: 1,
      };
}

/** qty * unit price, less the line discount. The one place a line total is computed. */
export const lineTotalMinor = (qty: number, unitPriceMinor: number, discountBps: number): number => {
  const gross = qty * unitPriceMinor;
  return gross - applyBps(gross, discountBps);
};
