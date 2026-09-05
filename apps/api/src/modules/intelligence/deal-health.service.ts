import { Injectable } from '@nestjs/common';
import { ErrorCode } from '@dealflow/contracts';
import { PrismaService } from '../../shared/prisma.service';
import { AppError } from '../../shared/app-error';
import { PolicyService } from './policy.service';
import { findHealthIssues } from './engine/deal-health';

const OPEN_STATUSES = [
  'DRAFT',
  'SUBMITTED',
  'PENDING_MANAGER',
  'PENDING_FINANCE',
  'APPROVED',
  'AUTO_APPROVED',
  'CONFIRMED',
  'NEGOTIATING',
  'FULFILLING',
] as const;

@Injectable()
export class DealHealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policies: PolicyService,
  ) {}

  /**
   * Idempotent sweep. An issue that is already open is left alone, and one that has
   * cleared is resolved, so running this on a schedule does not pile up duplicates.
   */
  async scan(now = new Date()) {
    const quotes = await this.prisma.quotation.findMany({
      where: { status: { in: OPEN_STATUSES as unknown as any[] } },
      include: { customer: true },
    });

    let opened = 0;
    let resolved = 0;

    for (const quote of quotes) {
      const tierDefault = await this.policies.tierDefault(quote.customer.tierId);
      const latest = await this.prisma.riskEvaluation.findFirst({
        where: { quotationId: quote.id },
        orderBy: { createdAt: 'desc' },
      });

      const findings = findHealthIssues(
        {
          quotationId: quote.id,
          status: quote.status,
          lastActivityAt: quote.lastActivityAt,
          weightedExcessBps: latest?.weightedExcessBps ?? 0,
          marginBps: latest?.marginBps ?? quote.marginBps,
        },
        tierDefault,
        now,
      );

      const open = await this.prisma.dealHealthEvent.findMany({
        where: { quotationId: quote.id, resolvedAt: null },
      });

      for (const f of findings) {
        if (open.some((e) => e.type === f.type)) continue;
        await this.prisma.dealHealthEvent.create({ data: { quotationId: quote.id, ...f } });
        opened += 1;
      }

      const stale = open.filter((e) => !findings.some((f) => f.type === e.type));
      if (stale.length > 0) {
        await this.prisma.dealHealthEvent.updateMany({
          where: { id: { in: stale.map((e) => e.id) } },
          data: { resolvedAt: now },
        });
        resolved += stale.length;
      }
    }

    return { scanned: quotes.length, opened, resolved };
  }

  list(quotationId?: string) {
    return this.prisma.dealHealthEvent.findMany({
      where: { resolvedAt: null, ...(quotationId ? { quotationId } : {}) },
      orderBy: [{ severity: 'desc' }, { createdAt: 'desc' }],
    });
  }

  /** A nudge is a recorded human action, not a state change. */
  async nudge(quotationId: string, actorId: string) {
    const quote = await this.prisma.quotation.findUnique({ where: { id: quotationId } });
    if (!quote) throw new AppError(ErrorCode.NOT_FOUND, 'Quotation not found.', { quotationId });

    await this.prisma.auditLog.create({
      data: { entityType: 'Quotation', entityId: quotationId, action: 'DEAL_NUDGED', actorId },
    });
    return { nudged: true, quotationId };
  }
}
