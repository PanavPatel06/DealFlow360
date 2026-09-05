import { ApprovalRole, RiskLevel } from '@dealflow/contracts';
import type { EvaluationResult } from '@dealflow/contracts';
import { blend, checkLines, toViolations } from './discount';
import { requiredApprovals } from './routing';
import type { EngineLine, Policy } from './types';

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/**
 * 0-100, deterministic. The score is presentation on top of the policy thresholds:
 * approvalRequired and the chain come from the thresholds, and riskLevel is read
 * back off the chain so a HIGH quote is always one that needs finance.
 */
function score(
  worstExcessBps: number,
  weightedExcessBps: number,
  marginBps: number,
  tierDefault: Policy,
): number {
  const band = Math.max(1, tierDefault.requiresFinanceAboveBps - tierDefault.requiresManagerAboveBps);
  const worst = clamp(worstExcessBps / band, 0, 1);
  const spread = clamp(weightedExcessBps / band, 0, 1);
  const margin =
    tierDefault.targetMarginBps <= 0
      ? 0
      : clamp(1 - marginBps / tierDefault.targetMarginBps, 0, 1);
  return Math.round(100 * (0.5 * worst + 0.3 * spread + 0.2 * margin));
}

const levelFor = (chain: ApprovalRole[]): RiskLevel =>
  chain.includes(ApprovalRole.FINANCE)
    ? RiskLevel.HIGH
    : chain.length > 0
      ? RiskLevel.MEDIUM
      : RiskLevel.LOW;

export function evaluate(
  lines: EngineLine[],
  policies: Policy[],
  tierId: string,
): EvaluationResult {
  const tierDefault = policies.find((p) => p.tierId === tierId && p.categoryId === null);
  if (!tierDefault) throw new Error(`No default discount policy for tier ${tierId}`);

  const checks = checkLines(lines, policies, tierId);
  const b = blend(checks);
  const chain = requiredApprovals(checks, b.weightedDiscountBps, tierDefault);

  return {
    riskScore: score(b.worstLineExcessBps, b.weightedExcessBps, b.marginBps, tierDefault),
    riskLevel: levelFor(chain),
    approvalRequired: chain.length > 0,
    requiredApprovals: chain,
    violations: toViolations(checks),
    blended: {
      weightedExcessBps: b.weightedExcessBps,
      worstLineExcessBps: b.worstLineExcessBps,
      marginBps: b.marginBps,
      weightedDiscountBps: b.weightedDiscountBps,
      worstLineDiscountBps: b.worstLineDiscountBps,
    },
  };
}
