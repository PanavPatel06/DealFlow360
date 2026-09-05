import {
  FulfillmentStatus,
  InvoiceStatus,
  LineType,
  MovementKind,
  SubscriptionStatus,
} from '@dealflow/contracts';
import { resolvePrice, lineTotalMinor } from './pricing';
import { computeTax, resolveTaxBps } from './tax';
import { availableQty, assertCoverage, backorder, movementsFor } from './stock';
import { assertTransition, consolidate, shippingCostMinor } from './fulfillment';
import { DomainError } from './types';
import type { CatalogProduct, OrderLine, StockLevel, TaxRule } from './types';
import { splitOrder } from '../../billing/engine/invoice';
import { generateCycles, assertSubscriptionTransition } from '../../billing/engine/schedule';
import { applyPayment, statusFor } from '../../billing/engine/payment';

const laptop: CatalogProduct = {
  id: 'prd_laptop',
  categoryId: 'cat_hw',
  listPriceMinor: 8500000,
  costMinor: 6300000,
  currency: 'INR',
  lineType: LineType.ONE_TIME,
  billingIntervalMonths: null,
};

const rows = [
  { priceListId: 'pl', productId: 'prd_laptop', minQty: 1, unitPriceMinor: 8500000 },
  { priceListId: 'pl', productId: 'prd_laptop', minQty: 10, unitPriceMinor: 8100000 },
  { priceListId: 'pl', productId: 'prd_laptop', minQty: 25, unitPriceMinor: 7800000 },
  { priceListId: 'pl', productId: 'prd_other', minQty: 1, unitPriceMinor: 1 },
];

const taxRules: TaxRule[] = [
  { id: 't1', categoryId: null, country: 'IN', rateBps: 1800 },
  { id: 't2', categoryId: 'cat_sv', country: 'IN', rateBps: 500 },
];

const levels: StockLevel[] = [
  { warehouseId: 'wh_main', warehouseName: 'Main', productId: 'prd_laptop', onHand: 22, reserved: 0, shippingBaseMinor: 300000, shippingPerUnitMinor: 5000 },
  { warehouseId: 'wh_east', warehouseName: 'East', productId: 'prd_laptop', onHand: 3, reserved: 1, shippingBaseMinor: 250000, shippingPerUnitMinor: 12000 },
];

describe('pricing', () => {
  it('takes the highest quantity break at or below qty', () => {
    expect(resolvePrice(laptop, 24, rows).unitPrice.amountMinor).toBe(8100000);
    expect(resolvePrice(laptop, 25, rows).unitPrice.amountMinor).toBe(7800000);
  });

  it('falls back to the catalog list price when no row covers the product', () => {
    const r = resolvePrice({ ...laptop, id: 'prd_new' }, 5, rows);
    expect(r.fromListPrice).toBe(true);
    expect(r.unitPrice.amountMinor).toBe(8500000);
  });

  it('applies the discount in bps, staying on integers', () => {
    expect(lineTotalMinor(1, 4500000, 1800)).toBe(3690000);
  });
});

describe('tax', () => {
  it('prefers the category rule over the country default', () => {
    expect(resolveTaxBps(taxRules, 'IN', 'cat_sv')).toBe(500);
    expect(resolveTaxBps(taxRules, 'IN', 'cat_hw')).toBe(1800);
    expect(resolveTaxBps(taxRules, 'US', 'cat_hw')).toBe(0);
  });

  it('taxes each line separately so mixed rates do not round once', () => {
    const { taxMinor } = computeTax(
      [{ categoryId: 'cat_hw', netMinor: 1000 }, { categoryId: 'cat_sv', netMinor: 1000 }],
      taxRules,
      'IN',
    );
    expect(taxMinor).toBe(180 + 50);
  });
});

describe('stock', () => {
  it('derives available from onHand minus reserved', () => {
    expect(availableQty(levels[1])).toBe(2);
  });

  it('refuses a split that exceeds what is on the shelf', () => {
    expect(() => assertCoverage([{ warehouseId: 'wh_east', productId: 'prd_laptop', qty: 3 }], levels))
      .toThrow(DomainError);
    expect(() => assertCoverage([{ warehouseId: 'wh_main', productId: 'prd_laptop', qty: 22 }, { warehouseId: 'wh_east', productId: 'prd_laptop', qty: 2 }], levels))
      .not.toThrow();
  });

  it('sums rows for the same warehouse before checking', () => {
    expect(() =>
      assertCoverage(
        [
          { warehouseId: 'wh_east', productId: 'prd_laptop', qty: 2 },
          { warehouseId: 'wh_east', productId: 'prd_laptop', qty: 1 },
        ],
        levels,
      ),
    ).toThrow(/stock/i);
  });

  it('reports what no warehouse can cover as backorder', () => {
    expect(backorder([{ productId: 'prd_laptop', qty: 30 }], levels)).toEqual([
      { productId: 'prd_laptop', qty: 6 },
    ]);
  });

  it('moves onHand only on ship', () => {
    const alloc = [{ warehouseId: 'wh_main', productId: 'prd_laptop', qty: 4 }];
    const ref = { type: 'fulfillment', id: 'f1' };
    expect(movementsFor(MovementKind.RESERVE, alloc, ref).deltas[0]).toMatchObject({ onHand: 0, reserved: 4 });
    expect(movementsFor(MovementKind.SHIP, alloc, ref).deltas[0]).toMatchObject({ onHand: -4, reserved: -4 });
  });
});

describe('fulfillment', () => {
  it('allows only the transitions in the table', () => {
    expect(() => assertTransition(FulfillmentStatus.PACKED, FulfillmentStatus.SHIPPED)).not.toThrow();
    expect(() => assertTransition(FulfillmentStatus.ORDER_CONFIRMED, FulfillmentStatus.SHIPPED)).toThrow(DomainError);
  });

  it('charges one base cost per warehouse when shipments consolidate', () => {
    const merged = consolidate([
      { warehouseId: 'wh_main', qty: 10, shippingBaseMinor: 300000, shippingPerUnitMinor: 5000 },
      { warehouseId: 'wh_main', qty: 12, shippingBaseMinor: 300000, shippingPerUnitMinor: 5000 },
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0].shippingMinor).toBe(shippingCostMinor(levels[0], 22));
  });
});

const orderLines: OrderLine[] = [
  { id: 'ol_1', productId: 'prd_laptop', description: 'ProBook 14', qty: 2, unitPriceMinor: 8100000, discountBps: 1200, lineTotalMinor: lineTotalMinor(2, 8100000, 1200), lineType: LineType.ONE_TIME, billingIntervalMonths: null, categoryId: 'cat_hw' },
  { id: 'ol_2', productId: 'prd_warranty', description: 'Extended Warranty', qty: 2, unitPriceMinor: 250000, discountBps: 1000, lineTotalMinor: lineTotalMinor(2, 250000, 1000), lineType: LineType.RECURRING, billingIntervalMonths: 1, categoryId: 'cat_hw' },
];

describe('billing', () => {
  const opts = { currency: 'INR', country: 'IN', taxRules, anythingShipped: true };

  it('splits one order into a one-time invoice and a subscription', () => {
    const { invoice, subscriptions } = splitOrder(orderLines, opts);
    expect(invoice!.lines).toHaveLength(1);
    expect(invoice!.totalMinor).toBe(14256000 + 2566080);
    expect(subscriptions).toHaveLength(1);
    expect(subscriptions[0].intervalMonths).toBe(1);
    expect(subscriptions[0].cycleAmountMinor).toBe(450000 + 81000);
  });

  it('refuses to invoice one-time lines before anything shipped', () => {
    expect(() => splitOrder(orderLines, { ...opts, anythingShipped: false })).toThrow(/shipment/i);
  });

  it('still raises the subscription for an order that never ships', () => {
    const { invoice, subscriptions } = splitOrder([orderLines[1]], { ...opts, anythingShipped: false });
    expect(invoice).toBeNull();
    expect(subscriptions).toHaveLength(1);
  });

  it('clamps a cycle date to the last day of a shorter month', () => {
    const cycles = generateCycles(new Date(Date.UTC(2026, 0, 31)), 1, 100, 3);
    expect(cycles.map((c) => c.dueDate.toISOString().slice(0, 10))).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
    ]);
  });

  it('does not let a cancelled subscription come back', () => {
    expect(() => assertSubscriptionTransition(SubscriptionStatus.ACTIVE, SubscriptionStatus.PAUSED)).not.toThrow();
    expect(() => assertSubscriptionTransition(SubscriptionStatus.CANCELLED, SubscriptionStatus.ACTIVE)).toThrow(DomainError);
  });
});

describe('payments', () => {
  const now = new Date(Date.UTC(2026, 5, 1));
  const invoice = {
    status: InvoiceStatus.ISSUED,
    totalMinor: 100000,
    paidMinor: 0,
    currency: 'INR',
    dueDate: new Date(Date.UTC(2026, 6, 1)),
  };

  it('moves through partially paid to paid', () => {
    const first = applyPayment(invoice, { amountMinor: 40000, currency: 'INR' }, now);
    expect(first.status).toBe(InvoiceStatus.PARTIALLY_PAID);
    const second = applyPayment({ ...invoice, ...first }, { amountMinor: 60000, currency: 'INR' }, now);
    expect(second.status).toBe(InvoiceStatus.PAID);
  });

  it('refuses an overpayment, a wrong currency and a draft invoice', () => {
    expect(() => applyPayment(invoice, { amountMinor: 100001, currency: 'INR' }, now)).toThrow(/exceeds/i);
    expect(() => applyPayment(invoice, { amountMinor: 1, currency: 'USD' }, now)).toThrow(/currency/i);
    expect(() => applyPayment({ ...invoice, status: InvoiceStatus.DRAFT }, { amountMinor: 1, currency: 'INR' }, now)).toThrow(DomainError);
  });

  it('reports an unpaid invoice past its due date as overdue', () => {
    expect(statusFor(invoice, new Date(Date.UTC(2026, 7, 1)))).toBe(InvoiceStatus.OVERDUE);
    expect(statusFor({ ...invoice, paidMinor: 100000 }, new Date(Date.UTC(2026, 7, 1)))).toBe(InvoiceStatus.PAID);
  });
});
