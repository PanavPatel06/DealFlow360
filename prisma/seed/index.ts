// Group owned. On the B3 branch it calls B3's seed only; base.seed, policy.seed and
// demo.seed land here at integration, in that order.
import { PrismaClient } from '@prisma/client';
import { seedCatalog } from './catalog.seed';

async function main() {
  const prisma = new PrismaClient();
  try {
    await seedCatalog(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
