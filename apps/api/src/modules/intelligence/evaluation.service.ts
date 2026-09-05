import { Injectable } from '@nestjs/common';
import { ErrorCode } from '@dealflow/contracts';
import type { EvaluationResult } from '@dealflow/contracts';
import { PrismaService } from '../../shared/prisma.service';
import { AppError } from '../../shared/app-error';
import { PolicyService } from './policy.service';
import { evaluate } from './engine/risk';
import type { EngineLine } from './engine/types';

const sameOutcome = (a: EvaluationResult, prev: any): boolean =>
  !!prev &&
  prev.riskScore === a.riskScore &&
  prev.riskLevel === a.riskLevel &&
  prev.approvalRequired === a.approvalRequired &&
  JSON.stringify(prev.requiredApprovals) === JSON.stringify(a.requiredApprovals) &&
  JSON.stringify(prev.violations) === JSON.stringify(a.violations);

@Injectable()
export class EvaluationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policies: PolicyService,
  ) {}

  private async loadQuote(quotationId: string) {
    const quote = await this.prisma.quotation.findUnique({
      where: { id: quotationId },
      include: {
        customer: true,
        lines: { include: { product: { include: { category: true } } } },
      },
    });
    if (!quote) throw new AppError(ErrorCode.NOT_FOUND, 'Quotation not found.', { quotationId });
    return quote;
  }

  /**
   * Idempotent: safe to call on every line change. An evaluation that comes out
   * identical to the newest one is returned as is, so the append-only history stays
   * a record of decisions rather than of keystrokes.
   */
  async evaluateQuote(quotationId: string, actorId: string | null) {
    const quote = await this.loadQuote(quotationId);
    const policies = await this.policies.forTier(quote.customer.tierId);
    const tierDefault = policies.find((p) => p.categoryId === null)!;

    const lines: EngineLine[] = quote.lines.map((l) => ({
      id: l.id,
      productId: l.productId,
      categoryId: l.product.categoryId,
      categoryName: l.product.category.name,
      qty: l.qty,
      unitPriceMinor: l.unitPriceMinor,
      discountBps: l.discountBps,
      costMinor: l.costMinor,
      lineType: l.lineType as EngineLine['lineType'],
    }));

    const result = evaluate(lines, policies, quote.customer.tierId);

    const previous = await this.prisma.riskEvaluation.findFirst({
      where: { quotationId },
      orderBy: { createdAt: 'desc' },
    });
    if (sameOutcome(result, previous)) return result;

    await this.prisma.$transaction(async (tx) => {
      const row = await tx.riskEvaluation.create({
        data: {
          quotationId,
          riskScore: result.riskScore,
          riskLevel: result.riskLevel,
          approvalRequired: result.approvalRequired,
          requiredApprovals: result.requiredApprovals,
          weightedExcessBps: result.blended.weightedExcessBps,
          worstLineExcessBps: result.blended.worstLineExcessBps,
          weightedDiscountBps: result.blended.weightedDiscountBps,
          marginBps: result.blended.marginBps,
          violations: result.violations as unknown as object,
        },
      });

      await tx.auditLog.create({
        data: {
          entityType: 'Quotation',
          entityId: quotationId,
          action: 'RISK_EVALUATED',
          actorId,
          fromValue: previous ? String(previous.riskScore) : null,
          toValue: String(result.riskScore),
          metadata: {
            requiredApprovals: result.requiredApprovals,
            violations: result.violations,
          } as unknown as object,
        },
      });

      await this.syncApproval(tx, quotationId, row.id, result, actorId);
    });

    // tierDefault is read above so a misconfigured tier fails here, not at approval time.
    void tierDefault;
    return result;
  }

  /** The chain the quote needs now. An outdated pending request is closed, not edited. */
  private async syncApproval(
    tx: any,
    quotationId: string,
    evaluationId: string,
    result: EvaluationResult,
    actorId: string | null,
  ) {
    const pending = await tx.approvalRequest.findFirst({
      where: { quotationId, status: 'PENDING' },
      include: { steps: { orderBy: { sequence: 'asc' } } },
    });

    const wanted = result.requiredApprovals;
    const current = pending?.steps.map((s: any) => s.role) ?? [];
    if (pending && JSON.stringify(current) === JSON.stringify(wanted)) return;

    if (pending) {
      await tx.approvalRequest.update({
        where: { id: pending.id },
        data: { status: 'RETURNED', currentStep: null },
      });
      await tx.auditLog.create({
        data: {
          entityType: 'ApprovalRequest',
          entityId: pending.id,
          action: 'APPROVAL_SUPERSEDED',
          actorId,
          toValue: JSON.stringify(wanted),
        },
      });
    }

    if (wanted.length === 0) return;

    const created = await tx.approvalRequest.create({
      data: {
        quotationId,
        evaluationId,
        currentStep: wanted[0],
        steps: { create: wanted.map((role, i) => ({ role, sequence: i })) },
      },
    });
    await tx.auditLog.create({
      data: {
        entityType: 'ApprovalRequest',
        entityId: created.id,
        action: 'APPROVAL_REQUESTED',
        actorId,
        toValue: JSON.stringify(wanted),
        metadata: { quotationId, evaluationId } as unknown as object,
      },
    });
  }

  history(quotationId: string) {
    return this.prisma.riskEvaluation.findMany({
      where: { quotationId },
      orderBy: { createdAt: 'desc' },
    });
  }
}
