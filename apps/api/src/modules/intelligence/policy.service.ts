import { Injectable } from '@nestjs/common';
import { ErrorCode } from '@dealflow/contracts';
import { PrismaService } from '../../shared/prisma.service';
import { AppError } from '../../shared/app-error';
import type { Policy } from './engine/types';

/** Every threshold that decides an outcome lives in a row here (invariant 9). */
@Injectable()
export class PolicyService {
  constructor(private readonly prisma: PrismaService) {}

  async forTier(tierId: string): Promise<Policy[]> {
    const rows = await this.prisma.discountPolicy.findMany({
      where: { tierId, isActive: true },
    });
    if (rows.length === 0) {
      throw new AppError(ErrorCode.NOT_FOUND, 'No active discount policy for this tier.', {
        tierId,
      });
    }
    return rows as unknown as Policy[];
  }

  async tierDefault(tierId: string): Promise<Policy> {
    const rows = await this.forTier(tierId);
    const def = rows.find((p) => p.categoryId === null);
    if (!def) {
      throw new AppError(ErrorCode.NOT_FOUND, 'Tier has no default discount policy.', { tierId });
    }
    return def;
  }

  list() {
    return this.prisma.discountPolicy.findMany({ orderBy: [{ tierId: 'asc' }, { categoryId: 'asc' }] });
  }

  async update(id: string, patch: Record<string, unknown>, actorId: string) {
    const before = await this.prisma.discountPolicy.findUnique({ where: { id } });
    if (!before) throw new AppError(ErrorCode.NOT_FOUND, 'Discount policy not found.', { id });

    return this.prisma.$transaction(async (tx) => {
      const after = await tx.discountPolicy.update({ where: { id }, data: patch });
      await tx.auditLog.create({
        data: {
          entityType: 'DiscountPolicy',
          entityId: id,
          action: 'POLICY_UPDATED',
          actorId,
          fromValue: JSON.stringify(before),
          toValue: JSON.stringify(after),
        },
      });
      return after;
    });
  }
}
