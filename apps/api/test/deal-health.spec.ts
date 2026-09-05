import { DealHealthType } from '@dealflow/contracts';
import { findHealthIssues } from '../src/modules/intelligence/engine/deal-health';
import { policies } from './policies.fixture';

const tierDefault = policies[0];
const now = new Date('2026-09-05T00:00:00Z');
const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000);

const deal = (over: Partial<Parameters<typeof findHealthIssues>[0]> = {}) => ({
  quotationId: 'qt_1',
  status: 'SUBMITTED',
  lastActivityAt: daysAgo(1),
  weightedExcessBps: 0,
  marginBps: 3000,
  ...over,
});

describe('deal health', () => {
  it('says nothing about a fresh, clean, profitable deal', () => {
    expect(findHealthIssues(deal(), tierDefault, now)).toEqual([]);
  });

  it('raises STALLED at the policy day count, not before', () => {
    expect(findHealthIssues(deal({ lastActivityAt: daysAgo(6) }), tierDefault, now)).toEqual([]);
    const found = findHealthIssues(deal({ lastActivityAt: daysAgo(7) }), tierDefault, now);
    expect(found.map((f) => f.type)).toEqual([DealHealthType.STALLED]);
  });

  it('raises a discount anomaly and a low margin together', () => {
    const found = findHealthIssues(deal({ weightedExcessBps: 300, marginBps: 400 }), tierDefault, now);
    expect(found.map((f) => f.type)).toEqual([
      DealHealthType.DISCOUNT_ANOMALY,
      DealHealthType.LOW_MARGIN,
    ]);
    expect(found[1].severity).toBe('HIGH');
  });
});
