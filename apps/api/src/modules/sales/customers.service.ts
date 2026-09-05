import { Injectable } from '@nestjs/common';
import { ErrorCode } from '@dealflow/contracts';
import { PrismaService } from '../../shared/prisma.service';
import { AppError } from '../../shared/app-error';
import type { RequestUser } from '../../shared/current-user.decorator';
import { assertOwnCustomer, scopedCustomerId } from './scope';
import type { CreateCustomerDto, ListCustomersDto, UpdateCustomerDto } from './dto';

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListCustomersDto, user: RequestUser) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const own = scopedCustomerId(user);
    const where = {
      ...(own ? { id: own } : {}),
      ...(query.tierId ? { tierId: query.tierId } : {}),
      ...(query.q
        ? { OR: [{ name: { contains: query.q, mode: 'insensitive' as const } }, { code: { contains: query.q, mode: 'insensitive' as const } }] }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.customer.findMany({
        where,
        include: { tier: true },
        orderBy: { name: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.customer.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  async get(id: string, user: RequestUser) {
    assertOwnCustomer(user, id);
    const customer = await this.prisma.customer.findUnique({
      where: { id },
      include: { tier: true, owner: { select: { id: true, name: true } } },
    });
    if (!customer) throw new AppError(ErrorCode.NOT_FOUND, 'Customer not found.', { id });
    return customer;
  }

  async create(dto: CreateCustomerDto, actorId: string) {
    const count = await this.prisma.customer.count();
    return this.prisma.$transaction(async (tx) => {
      const customer = await tx.customer.create({
        data: { ...dto, currency: dto.currency.toUpperCase(), code: `CUS-${1000 + count + 1}` },
        include: { tier: true },
      });
      await tx.auditLog.create({
        data: { entityType: 'Customer', entityId: customer.id, action: 'CUSTOMER_CREATED', actorId, toValue: customer.name },
      });
      return customer;
    });
  }

  async update(id: string, dto: UpdateCustomerDto, actorId: string) {
    const before = await this.prisma.customer.findUnique({ where: { id } });
    if (!before) throw new AppError(ErrorCode.NOT_FOUND, 'Customer not found.', { id });
    return this.prisma.$transaction(async (tx) => {
      const after = await tx.customer.update({ where: { id }, data: dto, include: { tier: true } });
      await tx.auditLog.create({
        data: {
          entityType: 'Customer',
          entityId: id,
          action: 'CUSTOMER_UPDATED',
          actorId,
          fromValue: JSON.stringify({ name: before.name, tierId: before.tierId }),
          toValue: JSON.stringify({ name: after.name, tierId: after.tierId }),
        },
      });
      return after;
    });
  }

  tiers() {
    return this.prisma.customerTier.findMany({ orderBy: { name: 'asc' } });
  }
}
