import { ErrorCode, LineType } from '@dealflow/contracts';
import { DomainError } from '../../operations/engine/types';
import type { OrderLine, TaxRule } from '../../operations/engine/types';
import { computeTax } from '../../operations/engine/tax';

export type DraftInvoiceLine = {
  productId: string;
  description: string;
  qty: number;
  unitPriceMinor: number;
  discountBps: number;
  taxBps: number;
  lineTotalMinor: number;
  lineType: LineType;
};

export type DraftInvoice = {
  currency: string;
  subtotalMinor: number;
  discountMinor: number;
  taxMinor: number;
  totalMinor: number;
  lines: DraftInvoiceLine[];
};

export type DraftSubscription = {
  intervalMonths: number;
  cycleAmountMinor: number;
  currency: string;
  lines: DraftInvoiceLine[];
};

/**
 * One order becomes a one-time invoice and, if it has recurring lines, one
 * subscription per billing cadence. This is the split the demo shows: the same
 * order producing an invoice and a subscription side by side.
 *
 * Invoicing before anything has shipped is refused. The caller passes
 * anythingShipped from the order's fulfillments; an order with no fulfillments at
 * all is still allowed to raise its recurring subscription, because a service that
 * bills monthly never ships.
 */
export function splitOrder(
  lines: OrderLine[],
  opts: { currency: string; country: string; taxRules: TaxRule[]; anythingShipped: boolean },
): { invoice: DraftInvoice | null; subscriptions: DraftSubscription[] } {
  const oneTime = lines.filter((l) => l.lineType === LineType.ONE_TIME);
  const recurring = lines.filter((l) => l.lineType === LineType.RECURRING);

  if (oneTime.length > 0 && !opts.anythingShipped) {
    throw new DomainError(
      ErrorCode.INVOICE_BEFORE_SHIPMENT,
      'Cannot invoice one-time lines before any shipment has left.',
      { orderLineIds: oneTime.map((l) => l.id) },
    );
  }

  const price = (l: OrderLine, taxBps: number): DraftInvoiceLine => ({
    productId: l.productId,
    description: l.description,
    qty: l.qty,
    unitPriceMinor: l.unitPriceMinor,
    discountBps: l.discountBps,
    taxBps,
    lineTotalMinor: l.lineTotalMinor,
    lineType: l.lineType,
  });

  const draft = (group: OrderLine[]): DraftInvoice => {
    const { taxMinor, perLine } = computeTax(
      group.map((l) => ({ categoryId: l.categoryId, netMinor: l.lineTotalMinor })),
      opts.taxRules,
      opts.country,
    );
    const gross = group.reduce((s, l) => s + l.qty * l.unitPriceMinor, 0);
    const net = group.reduce((s, l) => s + l.lineTotalMinor, 0);
    return {
      currency: opts.currency,
      subtotalMinor: gross,
      discountMinor: gross - net,
      taxMinor,
      totalMinor: net + taxMinor,
      lines: group.map((l, i) => price(l, perLine[i].taxBps)),
    };
  };

  // One subscription per cadence, so a monthly service and an annual one do not
  // end up sharing a schedule.
  const cadences = [...new Set(recurring.map((l) => l.billingIntervalMonths ?? 1))].sort(
    (a, b) => a - b,
  );

  return {
    invoice: oneTime.length > 0 ? draft(oneTime) : null,
    subscriptions: cadences.map((months) => {
      const group = recurring.filter((l) => (l.billingIntervalMonths ?? 1) === months);
      const d = draft(group);
      return {
        intervalMonths: months,
        cycleAmountMinor: d.totalMinor,
        currency: opts.currency,
        lines: d.lines,
      };
    }),
  };
}
