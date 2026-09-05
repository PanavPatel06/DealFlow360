import { Injectable } from '@nestjs/common';
import { ApprovalRole } from '@dealflow/contracts';
import { EvaluationService } from '../intelligence/evaluation.service';

/**
 * The two answers B1 needs from other modules. B1 never computes either.
 * IntelligencePort is bound to B2's EvaluationService (LiveIntelligence below).
 * TaxPort is still stubbed: B3 has the tax engine but no service to resolve a
 * customer's jurisdiction yet, so every quote is taxed at 0 until it lands.
 * ponytail: swap StubTax for B3's provider in sales.module.ts, nothing else.
 */
export type Evaluation = {
  riskScore: number;
  riskLevel: string;
  approvalRequired: boolean;
  requiredApprovals: ApprovalRole[];
  /** per line, keyed by quotation line id, for the OVER badge */
  perLine: Record<string, { allowedBps: number; excessBps: number }>;
};

@Injectable()
export abstract class IntelligencePort {
  abstract evaluate(quotationId: string, actorId: string | null): Promise<Evaluation>;
}

/**
 * B2's answer, reshaped for the quote view. Only lines that broke a ceiling come
 * back with numbers; the rest carry null, which is what F renders as "no badge".
 */
@Injectable()
export class LiveIntelligence extends IntelligencePort {
  constructor(private readonly evaluations: EvaluationService) {
    super();
  }

  async evaluate(quotationId: string, actorId: string | null): Promise<Evaluation> {
    const result = await this.evaluations.evaluateQuote(quotationId, actorId);
    return {
      riskScore: result.riskScore,
      riskLevel: result.riskLevel,
      approvalRequired: result.approvalRequired,
      requiredApprovals: result.requiredApprovals,
      perLine: Object.fromEntries(
        result.violations.map((v) => [
          v.quoteLineId,
          { allowedBps: v.allowedBps, excessBps: v.excessBps },
        ]),
      ),
    };
  }
}

@Injectable()
export abstract class TaxPort {
  /** basis points for this customer and currency, from B3's tax_rules */
  abstract rateBps(customerId: string, currency: string): Promise<number>;
}

@Injectable()
export class StubTax extends TaxPort {
  async rateBps(): Promise<number> {
    return 0;
  }
}
