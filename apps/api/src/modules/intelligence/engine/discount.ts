import { applyBps } from '@dealflow/contracts';
import type { DiscountViolation } from '@dealflow/contracts';
import type { EngineLine, Policy } from './types';

/**
 * The category policy for the customer's tier, falling back to the tier default
 * (categoryId null). Returns undefined when the tier has no policy at all, which
 * the caller treats as a configuration error rather than "no ceiling".
 */
export function resolvePolicy(
  policies: Policy[],
  tierId: string,
  categoryId: string | null,
): Policy | undefined {
  const forTier = policies.filter((p) => p.tierId === tierId);
  return (
    forTier.find((p) => p.categoryId === categoryId) ??
    forTier.find((p) => p.categoryId === null)
  );
}

export const lineGrossMinor = (l: EngineLine) => l.qty * l.unitPriceMinor;
export const lineNetMinor = (l: EngineLine) =>
  lineGrossMinor(l) - applyBps(lineGrossMinor(l), l.discountBps);

export type LineCheck = {
  line: EngineLine;
  policy: Policy;
  allowedBps: number;
  actualBps: number;
  excessBps: number;
  grossMinor: number;
  netMinor: number;
};

/** Per line, against that line's own category ceiling for the customer's tier. */
export function checkLines(lines: EngineLine[], policies: Policy[], tierId: string): LineCheck[] {
  return lines.map((line) => {
    const policy = resolvePolicy(policies, tierId, line.categoryId);
    if (!policy) throw new Error(`No discount policy for tier ${tierId}`);
    const excessBps = Math.max(0, line.discountBps - policy.maxDiscountBps);
    return {
      line,
      policy,
      allowedBps: policy.maxDiscountBps,
      actualBps: line.discountBps,
      excessBps,
      grossMinor: lineGrossMinor(line),
      netMinor: lineNetMinor(line),
    };
  });
}

export const toViolations = (checks: LineCheck[]): DiscountViolation[] =>
  checks
    .filter((c) => c.excessBps > 0)
    .map((c) => ({
      quoteLineId: c.line.id,
      categoryName: c.line.categoryName,
      allowedBps: c.allowedBps,
      actualBps: c.actualBps,
      excessBps: c.excessBps,
    }));

const weighted = (checks: LineCheck[], pick: (c: LineCheck) => number): number => {
  const base = checks.reduce((s, c) => s + c.grossMinor, 0);
  if (base === 0) return 0;
  return Math.round(checks.reduce((s, c) => s + pick(c) * c.grossMinor, 0) / base);
};

/**
 * Blend the per-line results into one set of numbers. This is why a quote whose
 * lines are each two points over is still caught: the weighted figures move even
 * when no single line looks dramatic.
 */
export function blend(checks: LineCheck[]) {
  const revenue = checks.reduce((s, c) => s + c.netMinor, 0);
  const cost = checks.reduce((s, c) => s + c.line.costMinor * c.line.qty, 0);
  return {
    weightedExcessBps: weighted(checks, (c) => c.excessBps),
    worstLineExcessBps: checks.reduce((m, c) => Math.max(m, c.excessBps), 0),
    weightedDiscountBps: weighted(checks, (c) => c.actualBps),
    worstLineDiscountBps: checks.reduce((m, c) => Math.max(m, c.actualBps), 0),
    marginBps: revenue === 0 ? 0 : Math.round(((revenue - cost) / revenue) * 10000),
    revenueMinor: revenue,
  };
}
