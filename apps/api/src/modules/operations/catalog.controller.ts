import { Controller, Get, Query } from '@nestjs/common';
import { money } from '@dealflow/contracts';
import { PrismaService } from '../../shared/prisma.service';
import { resolvePrice } from './engine/pricing';

/**
 * B3's read side. The quote builder cannot offer a product it cannot list, so
 * these four reads exist before the write endpoints do. Everything here is a
 * projection: no engine decides anything it does not already own.
 */
@Controller()
export class CatalogController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('products')
  async products(@Query('q') q?: string, @Query('categoryId') categoryId?: string) {
    const items = await this.prisma.product.findMany({
      where: {
        isActive: true,
        ...(categoryId ? { categoryId } : {}),
        ...(q ? { OR: [{ name: { contains: q, mode: 'insensitive' as const } }, { sku: { contains: q, mode: 'insensitive' as const } }] } : {}),
      },
      include: { category: true },
      orderBy: [{ category: { name: 'asc' } }, { name: 'asc' }],
    });
    return {
      items: items.map((p) => ({
        id: p.id,
        sku: p.sku,
        name: p.name,
        category: { id: p.categoryId, name: p.category.name },
        listPrice: money(p.listPriceMinor, p.currency),
        lineType: p.lineType,
        billingIntervalMonths: p.billingIntervalMonths,
      })),
      total: items.length,
    };
  }

  @Get('categories')
  async categories() {
    const items = await this.prisma.category.findMany({ orderBy: { name: 'asc' } });
    return { items, total: items.length };
  }

  /** The price a customer actually pays at this quantity, breaks included. */
  @Get('price-lists/resolve')
  async resolve(
    @Query('productId') productId: string,
    @Query('customerId') customerId: string,
    @Query('qty') qty = '1',
  ) {
    const [product, customer] = await Promise.all([
      this.prisma.product.findUniqueOrThrow({ where: { id: productId } }),
      this.prisma.customer.findUniqueOrThrow({ where: { id: customerId } }),
    ]);
    const rows = await this.prisma.priceListItem.findMany({
      where: { productId, priceList: { isActive: true, OR: [{ tierId: customer.tierId }, { tierId: null }] } },
    });
    return resolvePrice(product, Number(qty), rows);
  }

  @Get('warehouses')
  async warehouses() {
    const items = await this.prisma.warehouse.findMany({
      include: { inventory: { include: { product: true } } },
      orderBy: { name: 'asc' },
    });
    return {
      items: items.map((w) => ({
        id: w.id,
        code: w.code,
        name: w.name,
        country: w.country,
        // available is derived, never stored (plan.md section 6)
        stock: w.inventory.map((i) => ({
          productId: i.productId,
          productName: i.product.name,
          onHand: i.onHand,
          reserved: i.reserved,
          available: i.onHand - i.reserved,
        })),
      })),
      total: items.length,
    };
  }
}
