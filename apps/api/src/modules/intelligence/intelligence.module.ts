import { forwardRef, Module } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma.service';
import { AllocationService } from './allocation.service';
import { ApprovalsService } from './approvals.service';
import { AuditService } from './audit.service';
import { DealHealthService } from './deal-health.service';
import { EvaluationService } from './evaluation.service';
import { PolicyService } from './policy.service';
import { UpsellService } from './upsell.service';
import { SalesModule } from '../sales/sales.module';
import {
  ApprovalsController,
  AuditController,
  DealHealthController,
  PolicyController,
  QuoteIntelligenceController,
} from './intelligence.controller';

@Module({
  // forwardRef because SalesModule needs EvaluationService and this module needs
  // QuoteStateService: the two domains genuinely call each other.
  imports: [forwardRef(() => SalesModule)],
  controllers: [
    QuoteIntelligenceController,
    ApprovalsController,
    DealHealthController,
    AuditController,
    PolicyController,
  ],
  providers: [
    PrismaService,
    PolicyService,
    EvaluationService,
    ApprovalsService,
    AuditService,
    UpsellService,
    AllocationService,
    DealHealthService,
  ],
  // B3 calls the allocation split from its own POST /orders/:id/allocation route.
  exports: [AllocationService, AuditService, EvaluationService],
})
export class IntelligenceModule {}
