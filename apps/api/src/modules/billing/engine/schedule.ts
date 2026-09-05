import { ErrorCode, SubscriptionStatus } from '@dealflow/contracts';
import { DomainError } from '../../operations/engine/types';

export type Cycle = { cycleNumber: number; dueDate: Date; amountMinor: number };

/**
 * The due dates for a subscription, generated up front so the billing screen has
 * something to show without waiting for a worker to run. Same day of month each
 * cycle, clamped to the last day of shorter months, because a subscription that
 * starts on the 31st must not silently jump to the 1st of March.
 */
export function generateCycles(
  startDate: Date,
  intervalMonths: number,
  cycleAmountMinor: number,
  count: number,
): Cycle[] {
  if (intervalMonths <= 0 || count <= 0) {
    throw new DomainError(ErrorCode.VALIDATION_FAILED, 'Interval and count must be positive.', {
      intervalMonths,
      count,
    });
  }
  const day = startDate.getUTCDate();
  return Array.from({ length: count }, (_, i) => {
    const monthIndex = startDate.getUTCMonth() + i * intervalMonths;
    const year = startDate.getUTCFullYear() + Math.floor(monthIndex / 12);
    const month = ((monthIndex % 12) + 12) % 12;
    const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    return {
      cycleNumber: i + 1,
      dueDate: new Date(Date.UTC(year, month, Math.min(day, lastDay))),
      amountMinor: cycleAmountMinor,
    };
  });
}

const TRANSITIONS: Record<SubscriptionStatus, SubscriptionStatus[]> = {
  ACTIVE: [SubscriptionStatus.PAUSED, SubscriptionStatus.CANCELLED],
  PAUSED: [SubscriptionStatus.ACTIVE, SubscriptionStatus.CANCELLED],
  CANCELLED: [],
};

export function assertSubscriptionTransition(
  from: SubscriptionStatus,
  to: SubscriptionStatus,
): void {
  if (!TRANSITIONS[from].includes(to)) {
    throw new DomainError(
      ErrorCode.SUBSCRIPTION_INVALID_STATE,
      'Invalid subscription transition.',
      { from, to, allowed: TRANSITIONS[from] },
    );
  }
}

/**
 * Cancellation is end-of-cycle and unprorated: cycles already due are kept, future
 * ones are skipped. plan.md section 12 says name this gap in the demo rather than
 * implying proration works.
 * ponytail: no proration, add a credit-note engine when mid-cycle changes matter.
 */
export const cyclesAfterCancellation = (cycles: Cycle[], cancelledAt: Date): Cycle[] =>
  cycles.filter((c) => c.dueDate.getTime() <= cancelledAt.getTime());
