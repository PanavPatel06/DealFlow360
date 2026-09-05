import { ErrorCode, InvoiceStatus } from '@dealflow/contracts';
import { DomainError } from '../../operations/engine/types';

export type InvoiceBalance = {
  status: InvoiceStatus;
  totalMinor: number;
  paidMinor: number;
  currency: string;
  dueDate: Date | null;
};

export const dueMinor = (i: Pick<InvoiceBalance, 'totalMinor' | 'paidMinor'>): number =>
  i.totalMinor - i.paidMinor;

/**
 * Record one payment against an invoice and say what the invoice becomes. Payments
 * are recorded, not settled: no gateway call happens anywhere behind this.
 *
 * An overpayment is refused rather than clamped, because silently keeping the
 * difference is the kind of thing nobody notices until reconciliation.
 */
export function applyPayment(
  invoice: InvoiceBalance,
  payment: { amountMinor: number; currency: string },
  now: Date,
): { paidMinor: number; status: InvoiceStatus } {
  if (invoice.status === InvoiceStatus.VOID || invoice.status === InvoiceStatus.DRAFT) {
    throw new DomainError(ErrorCode.VALIDATION_FAILED, 'Invoice is not payable in this state.', {
      status: invoice.status,
    });
  }
  if (payment.currency !== invoice.currency) {
    throw new DomainError(ErrorCode.VALIDATION_FAILED, 'Payment currency must match the invoice.', {
      invoiceCurrency: invoice.currency,
      paymentCurrency: payment.currency,
    });
  }
  if (payment.amountMinor <= 0) {
    throw new DomainError(ErrorCode.VALIDATION_FAILED, 'Payment must be positive.', {
      amountMinor: payment.amountMinor,
    });
  }
  if (payment.amountMinor > dueMinor(invoice)) {
    throw new DomainError(ErrorCode.VALIDATION_FAILED, 'Payment exceeds the amount due.', {
      due: dueMinor(invoice),
      amountMinor: payment.amountMinor,
    });
  }

  const paidMinor = invoice.paidMinor + payment.amountMinor;
  return { paidMinor, status: statusFor({ ...invoice, paidMinor }, now) };
}

/** The status an invoice should carry given what has been paid and the due date. */
export function statusFor(invoice: InvoiceBalance, now: Date): InvoiceStatus {
  if (invoice.status === InvoiceStatus.VOID || invoice.status === InvoiceStatus.DRAFT) {
    return invoice.status;
  }
  if (invoice.paidMinor >= invoice.totalMinor) return InvoiceStatus.PAID;
  const overdue = invoice.dueDate !== null && invoice.dueDate.getTime() < now.getTime();
  if (invoice.paidMinor > 0) return overdue ? InvoiceStatus.OVERDUE : InvoiceStatus.PARTIALLY_PAID;
  return overdue ? InvoiceStatus.OVERDUE : InvoiceStatus.ISSUED;
}
