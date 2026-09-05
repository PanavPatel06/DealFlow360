import { planAllocation, type StockRow } from '../src/modules/intelligence/engine/allocation';

const wh = (id: string, name: string, available: number, base: number, per: number): StockRow => ({
  warehouseId: id,
  warehouseName: name,
  productId: 'prd_1',
  available,
  shippingBaseMinor: base,
  shippingPerUnitMinor: per,
  currency: 'INR',
});

describe('warehouse allocation', () => {
  it('ships from one warehouse when one can cover the line', () => {
    const plan = planAllocation([{ productId: 'prd_1', qty: 10 }], [
      wh('wh_main', 'Main Warehouse', 50, 4000, 100),
      wh('wh_east', 'East Depot', 50, 2000, 100),
    ]);
    expect(plan.totalShipments).toBe(1);
    expect(plan.allocations).toHaveLength(1);
    expect(plan.allocations[0].warehouseId).toBe('wh_east'); // same coverage, cheaper
  });

  it('splits only when no single warehouse covers the demand', () => {
    const plan = planAllocation([{ productId: 'prd_1', qty: 24 }], [
      wh('wh_main', 'Main Warehouse', 22, 4000, 100),
      wh('wh_east', 'East Depot', 5, 2000, 100),
    ]);
    expect(plan.totalShipments).toBe(2);
    expect(plan.allocations.map((a) => a.qty)).toEqual([22, 2]);
    expect(plan.backorder).toEqual([]);
  });

  it('charges the base shipping fee once per warehouse', () => {
    const plan = planAllocation([{ productId: 'prd_1', qty: 24 }], [
      wh('wh_main', 'Main Warehouse', 22, 4000, 100),
      wh('wh_east', 'East Depot', 5, 2000, 100),
    ]);
    expect(plan.allocations[0].shippingCost).toEqual({ amountMinor: 4000 + 2200, currency: 'INR' });
    expect(plan.allocations[1].shippingCost).toEqual({ amountMinor: 2000 + 200, currency: 'INR' });
  });

  it('backorders what stock cannot cover', () => {
    const plan = planAllocation(
      [{ productId: 'prd_1', qty: 30 }],
      [wh('wh_main', 'Main Warehouse', 12, 4000, 100)],
    );
    expect(plan.backorder).toEqual([{ productId: 'prd_1', qty: 18 }]);
    expect(plan.allocations[0].qty).toBe(12);
  });

  it('never allocates stock it already spent', () => {
    const stock = [wh('wh_main', 'Main Warehouse', 10, 4000, 100)];
    const plan = planAllocation(
      [
        { productId: 'prd_1', qty: 6 },
        { productId: 'prd_1', qty: 6 },
      ],
      stock,
    );
    const total = plan.allocations.reduce((s, a) => s + a.qty, 0);
    expect(total).toBe(10);
    expect(plan.backorder).toEqual([{ productId: 'prd_1', qty: 2 }]);
  });
});
