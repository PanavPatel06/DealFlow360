import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma.service';

export type AuditEntry = {
  entityType: string;
  entityId: string;
  action: string;
  actorId?: string | null;
  fromValue?: string | null;
  toValue?: string | null;
  metadata?: Record<string, unknown>;
};

/** Append only. Callers pass the transaction client so the row lands with the change. */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  write(tx: { auditLog: { create: Function } }, entry: AuditEntry) {
    return tx.auditLog.create({
      data: {
        entityType: entry.entityType,
        entityId: entry.entityId,
        action: entry.action,
        actorId: entry.actorId ?? null,
        fromValue: entry.fromValue ?? null,
        toValue: entry.toValue ?? null,
        metadata: (entry.metadata ?? {}) as object,
      },
    });
  }

  trail(entityType: string, entityId: string) {
    return this.prisma.auditLog.findMany({
      where: { entityType, entityId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async search(entityType?: string, entityId?: string, page = 1, pageSize = 50) {
    const where = { ...(entityType ? { entityType } : {}), ...(entityId ? { entityId } : {}) };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }
}
