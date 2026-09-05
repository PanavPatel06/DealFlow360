import { Injectable } from '@nestjs/common';
import { ErrorCode } from '@dealflow/contracts';
import { PrismaService } from '../../shared/prisma.service';
import { AppError } from '../../shared/app-error';
import { planAllocation, type StockRow } from './engine/allocation';

@Injectable()
export class AllocationService {
  constructor(private readonly prisma: PrismaService) {}

  /** Recommends a split. Commits nothing, reserves nothing. */
  async recommend(orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { lines: true },
    });
    if (!order) throw new AppError(ErrorCode.NOT_FOUND, 'Order not found.', { orderId });

    const productIds = [...new Set(order.lines.map((l) => l.productId))];
    const rows = await this.prisma.inventory.findMany({
      where: { productId: { in: productIds } },
      include: { warehouse: true },
    });

    const stock: StockRow[] = rows.map((r) => ({
      warehouseId: r.warehouseId,
      warehouseName: r.warehouse.name,
      productId: r.productId,
      available: r.onHand - r.reserved, // derived, never stored
      shippingBaseMinor: r.warehouse.shippingBaseMinor,
      shippingPerUnitMinor: r.warehouse.shippingPerUnitMinor,
      currency: r.warehouse.currency,
    }));

    const demand = productIds.map((productId) => ({
      productId,
      qty: order.lines.filter((l) => l.productId === productId).reduce((s, l) => s + l.qty, 0),
    }));

    return planAllocation(demand, stock);
  }

  /**
   * Records the choice. B2 owns inventory_reservations; the stock movement that
   * follows is B3's, because B2 does not write the inventory table.
   */
  async reserve(
    orderId: string,
    allocations: { warehouseId: string; productId: string; qty: number }[],
    actorId: string,
  ) {
    if (allocations.length === 0) {
      throw new AppError(ErrorCode.VALIDATION_FAILED, 'An allocation needs at least one line.', {
        orderId,
      });
    }
    const plan = await this.recommend(orderId);
    if (plan.backorder.length > 0) {
      throw new AppError(ErrorCode.INSUFFICIENT_STOCK, 'Not every line can be covered.', {
        backorder: plan.backorder,
      });
    }

    return this.prisma.$transaction(async (tx) => {
      const created = await Promise.all(
        allocations.map((a) =>
          tx.inventoryReservation.create({ data: { orderId, ...a, status: 'RESERVED' } }),
        ),
      );
      await tx.auditLog.create({
        data: {
          entityType: 'Order',
          entityId: orderId,
          action: 'INVENTORY_RESERVED',
          actorId,
          toValue: JSON.stringify(allocations),
        },
      });
      return created;
    });
  }

  async release(orderId: string, actorId: string) {
    return this.prisma.$transaction(async (tx) => {
      const result = await tx.inventoryReservation.updateMany({
        where: { orderId, status: { in: ['RESERVED', 'ALLOCATED'] } },
        data: { status: 'RELEASED' },
      });
      await tx.auditLog.create({
        data: {
          entityType: 'Order',
          entityId: orderId,
          action: 'INVENTORY_RELEASED',
          actorId,
          toValue: String(result.count),
        },
      });
      return result;
    });
  }
}
