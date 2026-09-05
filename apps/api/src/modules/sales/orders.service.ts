import { Injectable } from '@nestjs/common';
import { ErrorCode, OrderStatus, QuoteStatus, money } from '@dealflow/contracts';
import { PrismaService } from '../../shared/prisma.service';
import { AppError } from '../../shared/app-error';
import type { RequestUser } from '../../shared/current-user.decorator';
import { assertOwnCustomer, scopedCustomerId } from './scope';
import { QuoteStateService } from './quote-state.service';
import type { ListOrdersDto } from './dto';

/** What an order may become. Fulfilment drives it, and only forward. */
const ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  CONFIRMED: ['FULFILLING', 'CANCELLED'],
  FULFILLING: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
};

type QuoteForOrder = {
  id: string;
  customerId: string;
  currency: string;
  subtotalMinor: number;
  discountMinor: number;
  taxMinor: number;
  totalMinor: number;
  lines: {
    productId: string;
    description: string;
    qty: number;
    unitPriceMinor: number;
    discountBps: number;
    lineTotalMinor: number;
    costMinor: number;
    lineType: string;
  }[];
};

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly state: QuoteStateService,
  ) {}

  /**
   * Copies the quote's values instead of pointing at them, because the quote can
   * change after the order exists (plan section 6).
   */
  async createFromQuote(tx: any, quote: QuoteForOrder, actorId: string | null) {
    const count = await tx.order.count();
    const order = await tx.order.create({
      data: {
        code: `SO-${1000 + count + 1}`,
        quotationId: quote.id,
        customerId: quote.customerId,
        currency: quote.currency,
        subtotalMinor: quote.subtotalMinor,
        discountMinor: quote.discountMinor,
        taxMinor: quote.taxMinor,
        totalMinor: quote.totalMinor,
        lines: {
          create: quote.lines.map((l) => ({
            productId: l.productId,
            description: l.description,
            qty: l.qty,
            unitPriceMinor: l.unitPriceMinor,
            discountBps: l.discountBps,
            lineTotalMinor: l.lineTotalMinor,
            costMinor: l.costMinor,
            lineType: l.lineType as any,
          })),
        },
      },
    });
    await tx.auditLog.create({
      data: {
        entityType: 'Order',
        entityId: order.id,
        action: 'ORDER_CREATED',
        actorId,
        fromValue: quote.id,
        toValue: order.code,
      },
    });
    return order;
  }

  async list(query: ListOrdersDto, user: RequestUser) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const customerId = scopedCustomerId(user, query.customerId);
    const where = {
      ...(customerId ? { customerId } : {}),
      ...(query.status ? { status: query.status as OrderStatus } : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.order.findMany({
        where,
        include: { customer: true },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.order.count({ where }),
    ]);
    return {
      items: rows.map((o) => ({
        id: o.id,
        code: o.code,
        status: o.status,
        quotationId: o.quotationId,
        customer: { id: o.customerId, name: o.customer.name },
        total: money(o.totalMinor, o.currency),
        createdAt: o.createdAt.toISOString(),
      })),
      total,
      page,
      pageSize,
    };
  }

  async get(id: string, user: RequestUser) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: { customer: true, lines: true },
    });
    if (!order) throw new AppError(ErrorCode.NOT_FOUND, 'Order not found.', { id });
    assertOwnCustomer(user, order.customerId);
    const c = order.currency;
    return {
      id: order.id,
      code: order.code,
      status: order.status,
      quotationId: order.quotationId,
      customer: { id: order.customerId, name: order.customer.name },
      lines: order.lines.map((l) => ({
        id: l.id,
        productId: l.productId,
        description: l.description,
        qty: l.qty,
        unitPrice: money(l.unitPriceMinor, c),
        lineTotal: money(l.lineTotalMinor, c),
        lineType: l.lineType,
      })),
      totals: {
        subtotal: money(order.subtotalMinor, c),
        discount: money(order.discountMinor, c),
        tax: money(order.taxMinor, c),
        total: money(order.totalMinor, c),
      },
      createdAt: order.createdAt.toISOString(),
    };
  }

  /** Called as fulfilment progresses. Same table-driven refusal as the quote. */
  async setStatus(id: string, to: OrderStatus, actorId: string) {
    const order = await this.prisma.order.findUnique({ where: { id } });
    if (!order) throw new AppError(ErrorCode.NOT_FOUND, 'Order not found.', { id });
    const from = order.status as OrderStatus;
    if (!ORDER_TRANSITIONS[from].includes(to)) {
      throw new AppError(ErrorCode.QUOTE_INVALID_STATE, `An order cannot go from ${from} to ${to}.`, {
        orderId: id,
        from,
        to,
        allowed: ORDER_TRANSITIONS[from],
      });
    }
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.order.update({ where: { id }, data: { status: to } });
      // The deal follows its order, and only quote-state.service writes the status.
      const mirrored = { FULFILLING: QuoteStatus.FULFILLING, COMPLETED: QuoteStatus.COMPLETED }[to as string];
      if (mirrored) await this.state.transition(tx, order.quotationId, mirrored, actorId, { orderId: id });
      await tx.auditLog.create({
        data: {
          entityType: 'Order',
          entityId: id,
          action: 'ORDER_STATUS_CHANGED',
          actorId,
          fromValue: from,
          toValue: to,
        },
      });
      return updated;
    });
  }
}
