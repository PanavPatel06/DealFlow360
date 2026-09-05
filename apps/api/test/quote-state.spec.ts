import { QuoteStateService, TRANSITIONS } from '../src/modules/sales/quote-state.service';
import { QuoteStatus } from '@dealflow/contracts';

const state = new QuoteStateService();

describe('quotation state machine', () => {
  it('walks the approved path', () => {
    const path: QuoteStatus[] = [
      QuoteStatus.DRAFT,
      QuoteStatus.SUBMITTED,
      QuoteStatus.PENDING_MANAGER,
      QuoteStatus.PENDING_FINANCE,
      QuoteStatus.APPROVED,
      QuoteStatus.CONFIRMED,
      QuoteStatus.FULFILLING,
      QuoteStatus.COMPLETED,
    ];
    path.slice(0, -1).forEach((from, i) => expect(state.can(from, path[i + 1])).toBe(true));
  });

  it('refuses a jump the table does not allow', () => {
    expect(state.can(QuoteStatus.DRAFT, QuoteStatus.APPROVED)).toBe(false);
    expect(() => state.assert(QuoteStatus.DRAFT, QuoteStatus.CONFIRMED, 'qt_1')).toThrow(
      /cannot go from DRAFT to CONFIRMED/,
    );
  });

  it('sends a negotiated quote back into approval or back to confirmed', () => {
    expect(state.can(QuoteStatus.CONFIRMED, QuoteStatus.NEGOTIATING)).toBe(true);
    expect(state.can(QuoteStatus.NEGOTIATING, QuoteStatus.PENDING_MANAGER)).toBe(true);
    expect(state.can(QuoteStatus.NEGOTIATING, QuoteStatus.CONFIRMED)).toBe(true);
  });

  it('ends at terminal states', () => {
    expect(TRANSITIONS.REJECTED).toEqual([]);
    expect(TRANSITIONS.COMPLETED).toEqual([]);
  });

  it('covers every status', () => {
    Object.values(QuoteStatus).forEach((s) => expect(TRANSITIONS[s]).toBeDefined());
  });
});
