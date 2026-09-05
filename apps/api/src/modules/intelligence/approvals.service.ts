import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { ApprovalStatus, ErrorCode, QuoteStatus } from '@dealflow/contracts';
import { PrismaService } from '../../shared/prisma.service';
import { AppError } from '../../shared/app-error';
import { QuoteStateService } from '../sales/quote-state.service';

type Decision = typeof ApprovalStatus.APPROVED | typeof ApprovalStatus.REJECTED | typeof ApprovalStatus.RETURNED;

/**
 * The status a quote should land in once this decision sticks. B2 never writes
 * quotations.status itself (invariant 5): it hands this to B1's
 * QuoteStateService, inside the same transaction as the decision.
 */
const nextQuoteStatus = (decision: Decision, remainingRole: string | null) => {
  if (decision === ApprovalStatus.REJECTED) return QuoteStatus.REJECTED;
  if (decision === ApprovalStatus.RETURNED) return QuoteStatus.RETURNED;
  if (remainingRole === 'FINANCE') return QuoteStatus.PENDING_FINANCE;
  if (remainingRole === 'SALES_MANAGER') return QuoteStatus.PENDING_MANAGER;
  return QuoteStatus.APPROVED;
};

@Injectable()
export class ApprovalsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => QuoteStateService))
    private readonly quoteState: QuoteStateService,
  ) {}

  async list(status?: string, assignedRole?: string, page = 1, pageSize = 20) {
    const where = {
      ...(status ? { status: status as any } : {}),
      ...(assignedRole ? { currentStep: assignedRole as any } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.approvalRequest.findMany({
        where,
        include: { steps: { orderBy: { sequence: 'asc' } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.approvalRequest.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  /** The approval detail screen: the chain, the reasons and the trail in one read. */
  async get(id: string) {
    const request = await this.prisma.approvalRequest.findUnique({
      where: { id },
      include: { steps: { orderBy: { sequence: 'asc' }, include: { actions: true } } },
    });
    if (!request) throw new AppError(ErrorCode.NOT_FOUND, 'Approval request not found.', { id });

    const [evaluation, trail] = await Promise.all([
      this.prisma.riskEvaluation.findUnique({ where: { id: request.evaluationId } }),
      this.prisma.auditLog.findMany({
        where: { entityType: 'Quotation', entityId: request.quotationId },
        orderBy: { createdAt: 'asc' },
      }),
    ]);
    return { request, evaluation, trail };
  }

  async decide(id: string, decision: Decision, actor: { id: string; role: string }, reason?: string) {
    const request = await this.prisma.approvalRequest.findUnique({
      where: { id },
      include: { steps: { orderBy: { sequence: 'asc' } } },
    });
    if (!request) throw new AppError(ErrorCode.NOT_FOUND, 'Approval request not found.', { id });
    if (request.status !== ApprovalStatus.PENDING) {
      throw new AppError(ErrorCode.QUOTE_INVALID_STATE, 'This approval is already decided.', {
        id,
        status: request.status,
      });
    }

    const step = request.steps.find((s) => s.status === ApprovalStatus.PENDING);
    if (!step) {
      throw new AppError(ErrorCode.QUOTE_INVALID_STATE, 'No pending step on this approval.', { id });
    }
    if (step.role !== actor.role) {
      throw new AppError(ErrorCode.APPROVAL_STEP_NOT_YOURS, 'This step belongs to another role.', {
        stepId: step.id,
        stepRole: step.role,
        actorRole: actor.role,
      });
    }
    if (decision === ApprovalStatus.RETURNED && !reason) {
      throw new AppError(ErrorCode.VALIDATION_FAILED, 'A returned quote needs a reason.', { id });
    }

    const remaining =
      decision === ApprovalStatus.APPROVED
        ? (request.steps.find((s) => s.sequence > step.sequence)?.role ?? null)
        : null;
    const requestStatus = decision === ApprovalStatus.APPROVED && remaining ? ApprovalStatus.PENDING : decision;
    const quoteStatus = nextQuoteStatus(decision, remaining);

    return this.prisma.$transaction(async (tx) => {
      await tx.approvalStep.update({
        where: { id: step.id },
        data: { status: decision, decidedAt: new Date() },
      });
      await tx.approvalAction.create({
        data: { stepId: step.id, actorId: actor.id, decision, reason: reason ?? null },
      });
      const updated = await tx.approvalRequest.update({
        where: { id },
        data: { status: requestStatus, currentStep: remaining as any },
        include: { steps: { orderBy: { sequence: 'asc' } } },
      });
      await tx.auditLog.create({
        data: {
          entityType: 'Quotation',
          entityId: request.quotationId,
          action: `APPROVAL_${decision}`,
          actorId: actor.id,
          fromValue: step.role,
          toValue: quoteStatus,
          metadata: { approvalRequestId: id, stepId: step.id, reason: reason ?? null } as unknown as object,
        },
      });
      // B1 moves the quote. Same transaction, so a rejected transition rolls the
      // decision back rather than leaving an approved step on a quote that never moved.
      await this.quoteState.transition(tx as any, request.quotationId, quoteStatus, actor.id, {
        approvalRequestId: id,
        stepRole: step.role,
        decision,
      });
      return { request: updated, quoteStatus };
    });
  }
}
