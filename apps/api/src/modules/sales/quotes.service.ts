import { Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import {
  ErrorCode,
  LineType,
  QuoteStatus,
  money,
  type PortalQuoteView,
  type QuoteView,
} from '@dealflow/contracts';
import { PrismaService } from '../../shared/prisma.service';
import { AppError } from '../../shared/app-error';
import type { RequestUser } from '../../shared/current-user.decorator';
import { assertOwnCustomer, scopedCustomerId } from './scope';
import { QuoteStateService } from './quote-state.service';
import { computeTotals, lineTotalMinor } from './totals';
import { IntelligencePort, TaxPort, type Evaluation } from './ports';
import { OrdersService } from './orders.service';
import type { CreateLineDto, CreateQuoteDto, ListQuotesDto, UpdateLineDto, UpdateQuoteDto } from './dto';

type QuoteWithLines = Awaited<ReturnType<QuotesService['loadRaw']>>;

@Injectable()
export class QuotesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly state: QuoteStateService,
    private readonly intelligence: IntelligencePort,
    private readonly tax: TaxPort,
    private readonly orders: OrdersService,
  ) {}

  // ---------- reads ----------

  private async loadRaw(id: string) {
    const quote = await this.prisma.quotation.findUnique({
      where: { id },
      include: { customer: { include: { tier: true } }, lines: { orderBy: { createdAt: 'asc' } } },
    });
    if (!quote) throw new AppError(ErrorCode.NOT_FOUND, 'Quotation not found.', { id });
    return quote;
  }

  private view(quote: QuoteWithLines, evaluation: Evaluation | null): QuoteView {
    const c = quote.currency;
    return {
      id: quote.id,
      code: quote.code,
      status: quote.status as QuoteStatus,
      customer: { id: quote.customer.id, name: quote.customer.name, tier: quote.customer.tier.code },
      lines: quote.lines.map((l) => {
        const per = evaluation?.perLine[l.id];
        return {
          id: l.id,
          productId: l.productId,
          description: l.description,
          qty: l.qty,
          unitPrice: money(l.unitPriceMinor, c),
          discountBps: l.discountBps,
          allowedDiscountBps: per?.allowedBps ?? null,
          overBps: per?.excessBps ?? null,
          lineTotal: money(l.lineTotalMinor, c),
          lineType: l.lineType as LineType,
        };
      }),
      totals: {
        subtotal: money(quote.subtotalMinor, c),
        discount: money(quote.discountMinor, c),
        tax: money(quote.taxMinor, c),
        total: money(quote.totalMinor, c),
      },
      marginBps: quote.marginBps,
      validUntil: quote.validUntil?.toISOString() ?? null,
      portalToken: quote.portalToken,
      evaluation: evaluation
        ? {
            riskScore: evaluation.riskScore,
            riskLevel: evaluation.riskLevel,
            approvalRequired: evaluation.approvalRequired,
          }
        : null,
      approval: evaluation?.approvalRequired
        ? { status: 'PENDING', currentStep: evaluation.requiredApprovals[0] ?? null }
        : null,
    };
  }

  async get(id: string, user: RequestUser): Promise<QuoteView> {
    const quote = await this.loadRaw(id);
    assertOwnCustomer(user, quote.customerId);
    // POST /quotes/:id/evaluate is idempotent, so a read may ask for the numbers.
    return this.view(quote, await this.intelligence.evaluate(id, user.id));
  }

  async list(query: ListQuotesDto, user: RequestUser) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const customerId = scopedCustomerId(user, query.customerId);
    const where = {
      ...(customerId ? { customerId } : {}),
      ...(query.status ? { status: query.status as QuoteStatus } : {}),
      ...(query.ownerUserId ? { ownerUserId: query.ownerUserId } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.quotation.findMany({
        where,
        include: { customer: { include: { tier: true } } },
        orderBy: { lastActivityAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.quotation.count({ where }),
    ]);
    return {
      items: items.map((q) => ({
        id: q.id,
        code: q.code,
        status: q.status,
        customer: { id: q.customer.id, name: q.customer.name, tier: q.customer.tier.code },
        total: money(q.totalMinor, q.currency),
        lastActivityAt: q.lastActivityAt.toISOString(),
      })),
      total,
      page,
      pageSize,
    };
  }

  // ---------- writes ----------

  async create(dto: CreateQuoteDto, user: RequestUser) {
    const customer = await this.prisma.customer.findUnique({ where: { id: dto.customerId } });
    if (!customer) throw new AppError(ErrorCode.NOT_FOUND, 'Customer not found.', { id: dto.customerId });

    const count = await this.prisma.quotation.count();
    return this.prisma.$transaction(async (tx) => {
      const quote = await tx.quotation.create({
        data: {
          code: `Q-${1000 + count + 1}`,
          customerId: dto.customerId,
          ownerUserId: user.id,
          currency: dto.currency.toUpperCase(),
          portalToken: randomBytes(16).toString('hex'),
        },
      });
      await tx.auditLog.create({
        data: { entityType: 'Quotation', entityId: quote.id, action: 'QUOTE_CREATED', actorId: user.id, toValue: quote.code },
      });
      return quote;
    });
  }

  async update(id: string, dto: UpdateQuoteDto, user: RequestUser) {
    const quote = await this.loadRaw(id);
    this.assertEditable(quote.status as QuoteStatus, id);
    return this.prisma.quotation.update({
      where: { id },
      data: {
        ...(dto.validUntil ? { validUntil: new Date(dto.validUntil) } : {}),
        ...(dto.ownerUserId ? { ownerUserId: dto.ownerUserId } : {}),
        lastActivityAt: new Date(),
      },
    });
  }

  /** Lines are editable while the quote is still being built or was returned. */
  private assertEditable(status: QuoteStatus, id: string) {
    if (status !== QuoteStatus.DRAFT && status !== QuoteStatus.RETURNED) {
      throw new AppError(ErrorCode.QUOTE_INVALID_STATE, 'This quotation can no longer be edited.', {
        quotationId: id,
        status,
      });
    }
  }

  async addLine(id: string, dto: CreateLineDto, user: RequestUser) {
    const quote = await this.loadRaw(id);
    this.assertEditable(quote.status as QuoteStatus, id);

    const product = await this.prisma.product.findUnique({ where: { id: dto.productId } });
    if (!product) throw new AppError(ErrorCode.NOT_FOUND, 'Product not found.', { id: dto.productId });

    const line = {
      quotationId: id,
      productId: product.id,
      description: dto.description ?? product.name,
      qty: dto.qty,
      // B3 owns price resolution; the list price is the fallback until it lands.
      unitPriceMinor: product.listPriceMinor,
      discountBps: dto.discountBps ?? 0,
      costMinor: product.costMinor,
      lineType: dto.lineType ?? product.lineType,
    };

    await this.prisma.$transaction(async (tx) => {
      const created = await tx.quotationLine.create({
        data: { ...line, lineTotalMinor: lineTotalMinor(line) },
      });
      await tx.auditLog.create({
        data: {
          entityType: 'Quotation',
          entityId: id,
          action: 'LINE_ADDED',
          actorId: user.id,
          toValue: created.id,
          metadata: { productId: product.id, qty: dto.qty, discountBps: line.discountBps },
        },
      });
      await this.recalc(tx, id);
    });
    return this.get(id, user);
  }

  async updateLine(id: string, lineId: string, dto: UpdateLineDto, user: RequestUser) {
    const quote = await this.loadRaw(id);
    const before = quote.lines.find((l) => l.id === lineId);
    if (!before) throw new AppError(ErrorCode.NOT_FOUND, 'Quotation line not found.', { lineId });

    const negotiating = quote.status === QuoteStatus.CONFIRMED;
    if (!negotiating) this.assertEditable(quote.status as QuoteStatus, id);

    await this.prisma.$transaction(async (tx) => {
      // A confirmed deal being repriced is a negotiation, not an edit.
      if (negotiating) {
        await this.state.transition(tx, id, QuoteStatus.NEGOTIATING, user.id, { lineId });
      }
      const next = { ...before, ...dto };
      await tx.quotationLine.update({
        where: { id: lineId },
        data: { ...dto, lineTotalMinor: lineTotalMinor(next) },
      });
      await tx.auditLog.create({
        data: {
          entityType: 'Quotation',
          entityId: id,
          action: negotiating ? 'NEGOTIATED_LINE_APPLIED' : 'LINE_UPDATED',
          actorId: user.id,
          fromValue: JSON.stringify({ qty: before.qty, discountBps: before.discountBps }),
          toValue: JSON.stringify({ qty: next.qty, discountBps: next.discountBps }),
          metadata: { lineId },
        },
      });
      await this.recalc(tx, id);
    });

    // The loop: re-evaluated terms decide by themselves where the quote lands.
    if (negotiating) return this.settleNegotiation(id, user);
    return this.get(id, user);
  }

  async removeLine(id: string, lineId: string, user: RequestUser) {
    const quote = await this.loadRaw(id);
    this.assertEditable(quote.status as QuoteStatus, id);
    if (!quote.lines.some((l) => l.id === lineId)) {
      throw new AppError(ErrorCode.NOT_FOUND, 'Quotation line not found.', { lineId });
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.quotationLine.delete({ where: { id: lineId } });
      await tx.auditLog.create({
        data: { entityType: 'Quotation', entityId: id, action: 'LINE_REMOVED', actorId: user.id, fromValue: lineId },
      });
      await this.recalc(tx, id);
    });
    return this.get(id, user);
  }

  /** Totals are recomputed from the lines, never patched incrementally. */
  private async recalc(tx: any, id: string) {
    const quote = await tx.quotation.findUnique({ where: { id }, include: { lines: true } });
    const taxBps = await this.tax.rateBps(quote.customerId, quote.currency);
    const totals = computeTotals(quote.lines, taxBps);
    return tx.quotation.update({ where: { id }, data: { ...totals, lastActivityAt: new Date() } });
  }

  // ---------- transitions ----------

  async submit(id: string, user: RequestUser) {
    const quote = await this.loadRaw(id);
    if (quote.lines.length === 0) {
      throw new AppError(ErrorCode.VALIDATION_FAILED, 'A quotation needs at least one line.', { id });
    }
    await this.prisma.$transaction((tx) =>
      this.state.transition(tx as any, id, QuoteStatus.SUBMITTED, user.id),
    );

    // B2 decides. B1 only obeys the answer.
    const evaluation = await this.intelligence.evaluate(id, user.id);
    const next = evaluation.approvalRequired ? QuoteStatus.PENDING_MANAGER : QuoteStatus.AUTO_APPROVED;
    await this.prisma.$transaction((tx) =>
      this.state.transition(tx as any, id, next, user.id, {
        riskScore: evaluation.riskScore,
        requiredApprovals: evaluation.requiredApprovals,
      }),
    );
    return this.get(id, user);
  }

  /** Confirm turns the quote into an order in one transaction. */
  async confirm(id: string, user: RequestUser) {
    const quote = await this.loadRaw(id);
    assertOwnCustomer(user, quote.customerId);

    const order = await this.prisma.$transaction(async (tx) => {
      await this.state.transition(tx as any, id, QuoteStatus.CONFIRMED, user.id);
      return this.orders.createFromQuote(tx, quote, user.id);
    });
    return { quote: await this.get(id, user), orderId: order.id, orderCode: order.code };
  }

  /** Re-entry after a negotiated term: back to the deal, or back into approval. */
  private async settleNegotiation(id: string, user: RequestUser) {
    const evaluation = await this.intelligence.evaluate(id, user.id);
    const next = evaluation.approvalRequired ? QuoteStatus.PENDING_MANAGER : QuoteStatus.CONFIRMED;
    await this.prisma.$transaction((tx) =>
      this.state.transition(tx as any, id, next, user.id, {
        reason: 'NEGOTIATION_REEVALUATED',
        riskScore: evaluation.riskScore,
      }),
    );
    return this.get(id, user);
  }

  // ---------- portal ----------

  private async loadByToken(token: string) {
    const quote = await this.prisma.quotation.findUnique({
      where: { portalToken: token },
      include: { customer: { include: { tier: true } }, lines: { orderBy: { createdAt: 'asc' } } },
    });
    if (!quote) throw new AppError(ErrorCode.NOT_FOUND, 'That quotation link is not valid.');
    return quote;
  }

  /** Never carries a score, a margin, a cost or an approval note (section 8). */
  async portalGet(token: string, user?: RequestUser): Promise<PortalQuoteView> {
    const quote = await this.loadByToken(token);
    if (user) assertOwnCustomer(user, quote.customerId);
    const { evaluation, approval, marginBps, portalToken, ...safe } = this.view(quote, null);
    return {
      ...safe,
      lines: safe.lines.map(({ allowedDiscountBps, overBps, ...l }) => ({
        ...l,
        allowedDiscountBps: null,
        overBps: null,
      })),
      approvalPending: (
        [QuoteStatus.PENDING_MANAGER, QuoteStatus.PENDING_FINANCE, QuoteStatus.SUBMITTED] as QuoteStatus[]
      ).includes(quote.status as QuoteStatus),
    };
  }

  async portalConfirm(token: string, user?: RequestUser) {
    const quote = await this.loadByToken(token);
    if (user) assertOwnCustomer(user, quote.customerId);

    const evaluation = await this.intelligence.evaluate(quote.id, user?.id ?? null);
    if (evaluation.approvalRequired && quote.status !== QuoteStatus.APPROVED && quote.status !== QuoteStatus.AUTO_APPROVED) {
      const next = quote.status === QuoteStatus.CONFIRMED ? QuoteStatus.NEGOTIATING : QuoteStatus.PENDING_MANAGER;
      await this.prisma.$transaction((tx) =>
        this.state.transition(tx as any, quote.id, next, null, { source: 'PORTAL_CONFIRM' }),
      );
      const after = await this.prisma.quotation.findUnique({ where: { id: quote.id } });
      return { outcome: 'APPROVAL_REQUIRED' as const, status: after!.status };
    }

    const order = await this.prisma.$transaction(async (tx) => {
      await this.state.transition(tx as any, quote.id, QuoteStatus.CONFIRMED, null, { source: 'PORTAL_CONFIRM' });
      return this.orders.createFromQuote(tx, quote, null);
    });
    return { outcome: 'CONFIRMED' as const, orderId: order.id };
  }
}
