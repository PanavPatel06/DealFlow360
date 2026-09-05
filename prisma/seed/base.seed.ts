import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../../apps/api/src/modules/sales/auth/password';

/**
 * Group owned, written by B1 because it owns these tables. Roles, the five demo
 * users, the tiers and the demo customers. Every password is `password123`.
 */
export async function seedBase(prisma: PrismaClient) {
  const roleNames = ['ADMIN', 'SALES_REP', 'SALES_MANAGER', 'FINANCE', 'OPS', 'CUSTOMER'];
  const roles = Object.fromEntries(
    await Promise.all(
      roleNames.map(async (name) => [
        name,
        await prisma.role.upsert({ where: { name }, update: {}, create: { name } }),
      ]),
    ),
  );

  const tiers = Object.fromEntries(
    await Promise.all(
      [
        ['BRONZE', 'Bronze'],
        ['SILVER', 'Silver'],
        ['GOLD', 'Gold'],
        ['ENTERPRISE', 'Enterprise'],
      ].map(async ([code, name]) => [
        code,
        await prisma.customerTier.upsert({ where: { code }, update: {}, create: { code, name } }),
      ]),
    ),
  );

  const passwordHash = hashPassword('password123');
  const user = (email: string, name: string, role: string, customerId?: string) =>
    prisma.user.upsert({
      where: { email },
      update: {},
      create: { email, name, passwordHash, roleId: roles[role].id, customerId: customerId ?? null },
    });

  const rep = await user('rep@dealflow.test', 'Riya Rep', 'SALES_REP');
  await user('manager@dealflow.test', 'Manish Manager', 'SALES_MANAGER');
  await user('finance@dealflow.test', 'Farah Finance', 'FINANCE');
  await user('ops@dealflow.test', 'Omar Ops', 'OPS');
  await user('admin@dealflow.test', 'Aditi Admin', 'ADMIN');

  const acme = await prisma.customer.upsert({
    where: { code: 'CUS-1001' },
    update: {},
    create: {
      code: 'CUS-1001',
      name: 'Acme Corp',
      email: 'buyer@acme.test',
      currency: 'INR',
      tierId: tiers.GOLD.id,
      ownerUserId: rep.id,
    },
  });

  await prisma.customer.upsert({
    where: { code: 'CUS-1002' },
    update: {},
    create: {
      code: 'CUS-1002',
      name: 'Borealis Ltd',
      email: 'buyer@borealis.test',
      currency: 'INR',
      tierId: tiers.SILVER.id,
      ownerUserId: rep.id,
    },
  });

  // the portal login, scoped to exactly one customer
  await user('buyer@acme.test', 'Anita Buyer', 'CUSTOMER', acme.id);

  return { roles, tiers, acme, rep };
}
