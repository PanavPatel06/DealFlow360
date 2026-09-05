import { rankUpsells, type Candidate } from '../src/modules/intelligence/engine/upsell';

const c = (over: Partial<Candidate>): Candidate => ({
  productId: 'prd_x',
  name: 'Extended Warranty',
  kind: 'CROSS_SELL',
  weight: 10,
  listPriceMinor: 50_000,
  currency: 'INR',
  sourceProductName: 'Server',
  ...over,
});

describe('upsell ranking', () => {
  it('drops what is already on the quote', () => {
    expect(rankUpsells([c({ productId: 'prd_1' })], ['prd_1'])).toEqual([]);
  });

  it('ranks an upsell above a cross-sell of equal weight', () => {
    const ranked = rankUpsells(
      [
        c({ productId: 'a', name: 'A', kind: 'CROSS_SELL' }),
        c({ productId: 'b', name: 'B', kind: 'UPSELL' }),
      ],
      [],
    );
    expect(ranked.map((r) => r.productId)).toEqual(['b', 'a']);
    expect(ranked[0].rank).toBe(1);
  });

  it('adds up the lines that suggest the same product', () => {
    const ranked = rankUpsells(
      [
        c({ productId: 'a', name: 'A', weight: 5, sourceProductName: 'Server' }),
        c({ productId: 'a', name: 'A', weight: 5, sourceProductName: 'Rack' }),
        c({ productId: 'b', name: 'B', weight: 9 }),
      ],
      [],
    );
    expect(ranked[0].productId).toBe('a');
    expect(ranked[0].reason).toBe('Often bought with Rack, Server');
  });
});
