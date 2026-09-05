import { DealHealthType, RiskLevel } from '@dealflow/contracts';
import type { Policy } from './types';

export type DealSnapshot = {
  quotationId: string;
  status: string;
  lastActivityAt: Date;
  weightedExcessBps: number;
  marginBps: number;
};

export type HealthFinding = { type: DealHealthType; severity: RiskLevel; detail: string };

const DAY_MS = 86_400_000;

/**
 * The three signals B2 can see from quote data alone. DELIVERY_SLIPPAGE is the same
 * table but is raised from fulfilment dates, which B3 owns, so it is not raised here.
 * Every threshold is a policy column.
 */
export function findHealthIssues(
  deal: DealSnapshot,
  tierDefault: Policy,
  now: Date,
): HealthFinding[] {
  const out: HealthFinding[] = [];

  const idleDays = Math.floor((now.getTime() - deal.lastActivityAt.getTime()) / DAY_MS);
  if (idleDays >= tierDefault.stalledAfterDays) {
    out.push({
      type: DealHealthType.STALLED,
      severity: idleDays >= tierDefault.stalledAfterDays * 2 ? RiskLevel.HIGH : RiskLevel.MEDIUM,
      detail: `No activity for ${idleDays} days while in ${deal.status}.`,
    });
  }

  if (deal.weightedExcessBps > 0) {
    out.push({
      type: DealHealthType.DISCOUNT_ANOMALY,
      severity:
        deal.weightedExcessBps > tierDefault.requiresFinanceAboveBps - tierDefault.maxDiscountBps
          ? RiskLevel.HIGH
          : RiskLevel.MEDIUM,
      detail: `Blended discount runs ${deal.weightedExcessBps} bps over the tier ceilings.`,
    });
  }

  if (deal.marginBps < tierDefault.targetMarginBps) {
    out.push({
      type: DealHealthType.LOW_MARGIN,
      severity: deal.marginBps < tierDefault.targetMarginBps / 2 ? RiskLevel.HIGH : RiskLevel.MEDIUM,
      detail: `Margin ${deal.marginBps} bps is below the ${tierDefault.targetMarginBps} bps floor.`,
    });
  }

  return out;
}
