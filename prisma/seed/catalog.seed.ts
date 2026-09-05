import { PrismaClient } from '@prisma/client';

/**
 * B3's seed: the catalogue, prices, tax, warehouses and stock the demo walks
 * through. The numbers are chosen so the scripted flow works without manual setup:
 *
 *  - laptops split 22 / 2 across two warehouses, so 24 units force the split
 *  - a services category, so the setup line carries its own stricter ceiling
 *  - a recurring warranty, so one order produces an invoice and a subscription
 *
 * Category names are the join B2's discount_policies rows use; keep them stable.
 */
export async function seedCatalog(prisma: PrismaClient) {
  const categories = {
    hardware: await upsertCategory(prisma, 'Hardware'),
    services: await upsertCategory(prisma, 'Services'),
    support: await upsertCategory(prisma, 'Support'),
  };

  const products = {
    laptop: await upsertProduct(prisma, {
      sku: 'HW-LAPTOP-14',
      name: 'ProBook 14 Laptop',
      categoryId: categories.hardware.id,
      listPriceMinor: 8500000, // Rs 85,000
      costMinor: 6300000,
      lineType: 'ONE_TIME',
      billingIntervalMonths: null,
    }),
    dock: await upsertProduct(prisma, {
      sku: 'HW-DOCK-USBC',
      name: 'USB-C Docking Station',
      categoryId: categories.hardware.id,
      listPriceMinor: 1200000,
      costMinor: 780000,
      lineType: 'ONE_TIME',
      billingIntervalMonths: null,
    }),
    setup: await upsertProduct(prisma, {
      sku: 'SV-ONSITE-SETUP',
      name: 'Onsite Setup Service',
      categoryId: categories.services.id,
      listPriceMinor: 4500000,
      costMinor: 2400000,
      lineType: 'ONE_TIME',
      billingIntervalMonths: null,
    }),
    warranty: await upsertProduct(prisma, {
      sku: 'SP-WARRANTY-EXT',
      name: 'Extended Warranty, per month',
      categoryId: categories.support.id,
      listPriceMinor: 250000,
      costMinor: 90000,
      lineType: 'RECURRING',
      billingIntervalMonths: 1,
    }),
    training: await upsertProduct(prisma, {
      sku: 'SV-TRAINING-DAY',
      name: 'Admin Training Day',
      categoryId: categories.services.id,
      listPriceMinor: 3000000,
      costMinor: 1500000,
      lineType: 'ONE_TIME',
      billingIntervalMonths: null,
    }),
  };

  // One list for everybody, with a quantity break so a 24-unit order prices lower
  // than a single laptop without anyone typing a discount.
  const priceList = await prisma.priceList.upsert({
    where: { id: 'pl_standard' },
    update: {},
    create: { id: 'pl_standard', name: 'Standard INR', currency: 'INR', tierId: null },
  });
  await seedPriceItems(prisma, priceList.id, [
    { productId: products.laptop.id, minQty: 1, unitPriceMinor: 8500000 },
    { productId: products.laptop.id, minQty: 10, unitPriceMinor: 8100000 },
    { productId: products.laptop.id, minQty: 25, unitPriceMinor: 7800000 },
    { productId: products.dock.id, minQty: 1, unitPriceMinor: 1200000 },
    { productId: products.setup.id, minQty: 1, unitPriceMinor: 4500000 },
    { productId: products.warranty.id, minQty: 1, unitPriceMinor: 250000 },
    { productId: products.training.id, minQty: 1, unitPriceMinor: 3000000 },
  ]);

  // 18 percent is 1800 bps. Services are taxed the same here; the split exists so
  // a different rate can be configured without touching code.
  await seedTaxRules(prisma, [
    { id: 'tax_in_default', name: 'GST 18%', categoryId: null, country: 'IN', rateBps: 1800 },
    {
      id: 'tax_in_services',
      name: 'GST 18% services',
      categoryId: categories.services.id,
      country: 'IN',
      rateBps: 1800,
    },
  ]);

  const main = await upsertWarehouse(prisma, {
    id: 'wh_main',
    code: 'MAIN',
    name: 'Main Warehouse',
    shippingBaseMinor: 300000,
    shippingPerUnitMinor: 5000,
  });
  const east = await upsertWarehouse(prisma, {
    id: 'wh_east',
    code: 'EAST',
    name: 'East Depot',
    shippingBaseMinor: 250000,
    shippingPerUnitMinor: 12000,
  });

  // 22 + 2 laptops is exactly the demo's 24. Do not round these up.
  await seedStock(prisma, [
    { warehouseId: main.id, productId: products.laptop.id, onHand: 22 },
    { warehouseId: east.id, productId: products.laptop.id, onHand: 2 },
    { warehouseId: main.id, productId: products.dock.id, onHand: 60 },
    { warehouseId: east.id, productId: products.dock.id, onHand: 15 },
  ]);

  // Seeded pairs, ranked by B2. plan.md section 13 calls learning these from real
  // co-purchase history the next thing to build.
  await seedRelationships(prisma, [
    { productId: products.laptop.id, relatedProductId: products.dock.id, kind: 'CROSS_SELL', weight: 90 },
    { productId: products.laptop.id, relatedProductId: products.warranty.id, kind: 'UPSELL', weight: 75 },
    { productId: products.setup.id, relatedProductId: products.training.id, kind: 'UPSELL', weight: 60 },
  ]);

  return { categories, products, warehouses: { main, east }, priceList };
}

const upsertCategory = (prisma: PrismaClient, name: string) =>
  prisma.category.upsert({ where: { name }, update: {}, create: { name } });

type ProductSeed = {
  sku: string;
  name: string;
  categoryId: string;
  listPriceMinor: number;
  costMinor: number;
  lineType: 'ONE_TIME' | 'RECURRING';
  billingIntervalMonths: number | null;
};

const upsertProduct = (prisma: PrismaClient, p: ProductSeed) =>
  prisma.product.upsert({
    where: { sku: p.sku },
    update: { listPriceMinor: p.listPriceMinor, costMinor: p.costMinor },
    create: { ...p, currency: 'INR' },
  });

async function seedPriceItems(
  prisma: PrismaClient,
  priceListId: string,
  items: { productId: string; minQty: number; unitPriceMinor: number }[],
) {
  for (const item of items) {
    await prisma.priceListItem.upsert({
      where: {
        priceListId_productId_minQty: {
          priceListId,
          productId: item.productId,
          minQty: item.minQty,
        },
      },
      update: { unitPriceMinor: item.unitPriceMinor },
      create: { priceListId, ...item },
    });
  }
}

async function seedTaxRules(
  prisma: PrismaClient,
  rules: { id: string; name: string; categoryId: string | null; country: string; rateBps: number }[],
) {
  for (const rule of rules) {
    await prisma.taxRule.upsert({ where: { id: rule.id }, update: { rateBps: rule.rateBps }, create: rule });
  }
}

const upsertWarehouse = (
  prisma: PrismaClient,
  w: { id: string; code: string; name: string; shippingBaseMinor: number; shippingPerUnitMinor: number },
) =>
  prisma.warehouse.upsert({
    where: { id: w.id },
    update: {},
    create: { ...w, country: 'IN', currency: 'INR' },
  });

async function seedStock(
  prisma: PrismaClient,
  rows: { warehouseId: string; productId: string; onHand: number }[],
) {
  for (const row of rows) {
    await prisma.inventory.upsert({
      where: { warehouseId_productId: { warehouseId: row.warehouseId, productId: row.productId } },
      // Reset on reseed: the demo is rerun from clean and stale reservations would
      // make the split refuse itself the second time round.
      update: { onHand: row.onHand, reserved: 0 },
      create: { ...row, reserved: 0 },
    });
  }
}

async function seedRelationships(
  prisma: PrismaClient,
  pairs: { productId: string; relatedProductId: string; kind: 'UPSELL' | 'CROSS_SELL'; weight: number }[],
) {
  for (const pair of pairs) {
    await prisma.productRelationship.upsert({
      where: {
        productId_relatedProductId_kind: {
          productId: pair.productId,
          relatedProductId: pair.relatedProductId,
          kind: pair.kind,
        },
      },
      update: { weight: pair.weight },
      create: pair,
    });
  }
}
