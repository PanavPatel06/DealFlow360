import { applyBps } from '@dealflow/contracts';
import type { TaxRule } from './types';

/**
 * The rule for a category in a country, falling back to that country's default
 * rule (categoryId null). Zero when the country has no rule at all, which is a
 * catalog with no tax configured rather than a bug.
 */
export function resolveTaxBps(rules: TaxRule[], country: string, categoryId: string): number {
  const inCountry = rules.filter((r) => r.country === country);
  const rule =
    inCountry.find((r) => r.categoryId === categoryId) ??
    inCountry.find((r) => r.categoryId === null);
  return rule?.rateBps ?? 0;
}

export type TaxableLine = { categoryId: string; netMinor: number };

/**
 * Tax per line on the net amount, then summed. Taxing the total instead would
 * round once for a mix of rates and quietly change the invoice by a rupee.
 */
export function computeTax(
  lines: TaxableLine[],
  rules: TaxRule[],
  country: string,
): { taxMinor: number; perLine: { categoryId: string; taxBps: number; taxMinor: number }[] } {
  const perLine = lines.map((l) => {
    const taxBps = resolveTaxBps(rules, country, l.categoryId);
    return { categoryId: l.categoryId, taxBps, taxMinor: applyBps(l.netMinor, taxBps) };
  });
  return { taxMinor: perLine.reduce((s, l) => s + l.taxMinor, 0), perLine };
}
