// Group owned. Calls the seed files in order. Order matters: policy.seed joins
// B1's tiers to B3's categories, so both have to exist before it runs.
import { PrismaClient } from '@prisma/client';
import { seedBase } from './base.seed';
import { seedCatalog } from './catalog.seed';
import { seedPolicies } from './policy.seed';

async function main() {
  const prisma = new PrismaClient();
  try {
    await seedBase(prisma);
    console.log('seeded: roles, users, tiers, customers');
    await seedCatalog(prisma);
    console.log('seeded: categories, products, prices, tax, warehouses, stock');
    await seedPolicies(prisma);
    console.log('seeded: discount policies');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
