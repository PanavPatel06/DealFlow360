import { Injectable } from '@nestjs/common';
import { ErrorCode } from '@dealflow/contracts';
import { PrismaService } from '../../shared/prisma.service';
import { AppError } from '../../shared/app-error';
import { rankUpsells, type Candidate } from './engine/upsell';

@Injectable()
export class UpsellService {
  constructor(private readonly prisma: PrismaService) {}

  /** B3 seeds the pairs, B2 ranks them against what is already on the quote. */
  async forQuote(quotationId: string) {
    const quote = await this.prisma.quotation.findUnique({
      where: { id: quotationId },
      include: { lines: { include: { product: true } } },
    });
    if (!quote) throw new AppError(ErrorCode.NOT_FOUND, 'Quotation not found.', { quotationId });

    const onQuote = quote.lines.map((l) => l.productId);
    if (onQuote.length === 0) return { items: [] };

    const pairs = await this.prisma.productRelationship.findMany({
      where: { productId: { in: onQuote } },
      include: { relatedProduct: true, product: true },
    });

    const candidates: Candidate[] = pairs.map((p) => ({
      productId: p.relatedProductId,
      name: p.relatedProduct.name,
      kind: p.kind,
      weight: p.weight,
      listPriceMinor: p.relatedProduct.listPriceMinor,
      currency: p.relatedProduct.currency,
      sourceProductName: p.product.name,
    }));

    return { items: rankUpsells(candidates, onQuote) };
  }
}
