import { money } from '@dealflow/contracts';
import type { UpsellSuggestion } from '@dealflow/contracts';

export type Candidate = {
  productId: string;
  name: string;
  kind: string; // UPSELL or CROSS_SELL
  weight: number;
  listPriceMinor: number;
  currency: string;
  /** the quote line that pulled this candidate in */
  sourceProductName: string;
};

/**
 * Seeded pairs, ranked. A candidate suggested by several lines on the quote scores
 * higher than one suggested by a single line, and an upsell outranks a cross-sell
 * at equal weight because it lifts the line that is already being bought.
 */
export function rankUpsells(
  candidates: Candidate[],
  alreadyOnQuote: string[],
  limit = 5,
): UpsellSuggestion[] {
  const owned = new Set(alreadyOnQuote);
  const byProduct = new Map<string, { score: number; c: Candidate; sources: Set<string> }>();

  for (const c of candidates) {
    if (owned.has(c.productId)) continue;
    const weight = c.weight * (c.kind === 'UPSELL' ? 2 : 1);
    const entry = byProduct.get(c.productId);
    if (entry) {
      entry.score += weight;
      entry.sources.add(c.sourceProductName);
    } else {
      byProduct.set(c.productId, { score: weight, c, sources: new Set([c.sourceProductName]) });
    }
  }

  return [...byProduct.values()]
    .sort((a, b) => b.score - a.score || a.c.name.localeCompare(b.c.name))
    .slice(0, limit)
    .map((e, i) => ({
      productId: e.c.productId,
      name: e.c.name,
      reason: `Often bought with ${[...e.sources].sort().join(', ')}`,
      rank: i + 1,
      score: e.score,
      unitPrice: money(e.c.listPriceMinor, e.c.currency),
    }));
}
