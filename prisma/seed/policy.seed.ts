import { PrismaClient } from '@prisma/client';

/**
 * B2's seed. Every number that decides an outcome lives here and nowhere else,
 * so the demo can be retuned without touching code (invariant 9).
 */
export async function seedPolicies(prisma: PrismaClient) {
  const tiers = await prisma.customerTier.findMany();
  const categories = await prisma.category.findMany();
  const byName = (n: string) => categories.find((c) => c.name === n)?.id ?? null;

  // tier default, then the categories that need a tighter or looser ceiling
  const table: Record<string, { category: string | null; max: number; mgr: number; fin: number }[]> = {
    BRONZE: [
      { category: null, max: 500, mgr: 500, fin: 1200 },
      { category: 'Services', max: 300, mgr: 300, fin: 900 },
    ],
    SILVER: [
      { category: null, max: 800, mgr: 800, fin: 1500 },
      { category: 'Services', max: 600, mgr: 600, fin: 1200 },
    ],
    GOLD: [
      { category: null, max: 1200, mgr: 1200, fin: 2000 },
      { category: 'Services', max: 1000, mgr: 1000, fin: 1600 },
      { category: 'Hardware', max: 1500, mgr: 1500, fin: 2200 },
    ],
    ENTERPRISE: [
      { category: null, max: 1500, mgr: 1500, fin: 2200 },
      { category: 'Services', max: 1200, mgr: 1200, fin: 1800 },
      { category: 'Hardware', max: 1800, mgr: 1800, fin: 2500 },
    ],
  };

  // Keyed by tier.code (BRONZE/GOLD/...), not tier.name, which is title case
  // in B1's customer_tiers ("Gold"). Every tier would fall back to SILVER.
  for (const tier of tiers) {
    for (const row of table[tier.code] ?? table.SILVER) {
      const categoryId = row.category ? byName(row.category) : null;
      if (row.category && !categoryId) continue; // B3 has not seeded that category yet
      const ceilings = {
        maxDiscountBps: row.max,
        requiresManagerAboveBps: row.mgr,
        requiresFinanceAboveBps: row.fin,
      };
      // findFirst rather than upsert: the tier-default row has categoryId null,
      // and Prisma's compound unique input will not take a null.
      const existing = await prisma.discountPolicy.findFirst({
        where: { tierId: tier.id, categoryId },
      });
      if (existing) {
        await prisma.discountPolicy.update({ where: { id: existing.id }, data: ceilings });
      } else {
        await prisma.discountPolicy.create({
          data: { tierId: tier.id, categoryId, ...ceilings, targetMarginBps: 1500, stalledAfterDays: 7 },
        });
      }
    }
  }
}
