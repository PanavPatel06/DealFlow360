import { Injectable } from '@nestjs/common';
import { ErrorCode, QuoteStatus } from '@dealflow/contracts';
import { AppError } from '../../shared/app-error';

/**
 * The only file allowed to write quotations.status (invariant 5). The table below
 * is the workflow: if an arrow is not here, the transition cannot happen.
 */
export const TRANSITIONS: Record<QuoteStatus, QuoteStatus[]> = {
  DRAFT: ['SUBMITTED'],
  SUBMITTED: ['AUTO_APPROVED', 'PENDING_MANAGER'],
  // APPROVED direct from the manager is the single-step chain, when B2 asked for
  // SALES_MANAGER only and no finance step exists.
  PENDING_MANAGER: ['PENDING_FINANCE', 'APPROVED', 'REJECTED', 'RETURNED'],
  PENDING_FINANCE: ['APPROVED', 'REJECTED'],
  RETURNED: ['DRAFT'],
  AUTO_APPROVED: ['CONFIRMED'],
  APPROVED: ['CONFIRMED'],
  CONFIRMED: ['FULFILLING', 'NEGOTIATING'],
  // a re-evaluated negotiation lands back on the deal, or back in approval
  NEGOTIATING: ['CONFIRMED', 'PENDING_MANAGER'],
  FULFILLING: ['COMPLETED'],
  COMPLETED: [],
  REJECTED: [],
};

/** A Prisma client or an open transaction client. */
type Tx = {
  quotation: { findUnique: Function; update: Function };
  auditLog: { create: Function };
};

@Injectable()
export class QuoteStateService {
  can(from: QuoteStatus, to: QuoteStatus): boolean {
    return TRANSITIONS[from]?.includes(to) ?? false;
  }

  assert(from: QuoteStatus, to: QuoteStatus, quotationId?: string): void {
    if (!this.can(from, to)) {
      throw new AppError(
        ErrorCode.QUOTE_INVALID_STATE,
        `A quotation cannot go from ${from} to ${to}.`,
        { quotationId, from, to, allowed: TRANSITIONS[from] ?? [] },
      );
    }
  }

  /**
   * Moves the quote and writes the audit row in the same transaction
   * (invariant 6). Callers pass the transaction client they are already inside.
   */
  async transition(
    tx: Tx,
    quotationId: string,
    to: QuoteStatus,
    actorId: string | null,
    metadata: Record<string, unknown> = {},
  ) {
    const quote = await tx.quotation.findUnique({ where: { id: quotationId } });
    if (!quote) throw new AppError(ErrorCode.NOT_FOUND, 'Quotation not found.', { quotationId });

    this.assert(quote.status as QuoteStatus, to, quotationId);

    const updated = await tx.quotation.update({
      where: { id: quotationId },
      data: { status: to, lastActivityAt: new Date() },
    });
    await tx.auditLog.create({
      data: {
        entityType: 'Quotation',
        entityId: quotationId,
        action: 'STATUS_CHANGED',
        actorId,
        fromValue: quote.status,
        toValue: to,
        metadata,
      },
    });
    return updated;
  }
}
