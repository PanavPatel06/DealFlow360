import { ApprovalRole } from '@dealflow/contracts';
import type { LineCheck } from './discount';
import type { Policy } from './types';

/** Ordered weakest to strongest, so a chain is a slice of this list. */
const LADDER = [ApprovalRole.SALES_MANAGER, ApprovalRole.FINANCE] as const;

/** How far up the ladder one discount has to climb under one policy. */
function rungFor(discountBps: number, overCeiling: boolean, policy: Policy): number {
  if (discountBps > policy.requiresFinanceAboveBps) return 2;
  if (discountBps > policy.requiresManagerAboveBps || overCeiling) return 1;
  return 0;
}

/**
 * The chain is the highest rung any single line reaches, or the rung the blended
 * discount reaches against the tier default. Every threshold is a policy column,
 * never a literal here.
 */
export function requiredApprovals(
  checks: LineCheck[],
  blendedDiscountBps: number,
  tierDefault: Policy,
): ApprovalRole[] {
  const perLine = checks.map((c) => rungFor(c.actualBps, c.excessBps > 0, c.policy));
  const blended = rungFor(
    blendedDiscountBps,
    blendedDiscountBps > tierDefault.maxDiscountBps,
    tierDefault,
  );
  const rung = Math.max(blended, ...perLine, 0);
  return LADDER.slice(0, rung);
}
