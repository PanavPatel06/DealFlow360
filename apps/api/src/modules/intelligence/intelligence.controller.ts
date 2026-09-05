import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';
import { ApprovalStatus } from '@dealflow/contracts';
import { CurrentUser, type RequestUser } from '../../shared/current-user.decorator';
import { ApprovalsService } from './approvals.service';
import { AuditService } from './audit.service';
import { DealHealthService } from './deal-health.service';
import { EvaluationService } from './evaluation.service';
import { PolicyService } from './policy.service';
import { UpsellService } from './upsell.service';
import { DecisionDto, UpdatePolicyDto } from './dto';

@Controller('quotes/:id')
export class QuoteIntelligenceController {
  constructor(
    private readonly evaluations: EvaluationService,
    private readonly upsell: UpsellService,
  ) {}

  @Post('evaluate')
  evaluate(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.evaluations.evaluateQuote(id, user.id);
  }

  @Get('evaluations')
  history(@Param('id') id: string) {
    return this.evaluations.history(id);
  }

  @Get('upsell')
  upsells(@Param('id') id: string) {
    return this.upsell.forQuote(id);
  }
}

@Controller('approvals')
export class ApprovalsController {
  constructor(private readonly approvals: ApprovalsService) {}

  @Get()
  list(
    @Query('status') status?: string,
    @Query('assignedRole') assignedRole?: string,
    @Query('page') page = '1',
  ) {
    return this.approvals.list(status, assignedRole, Number(page));
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.approvals.get(id);
  }

  @Post(':id/approve')
  approve(@Param('id') id: string, @Body() body: DecisionDto, @CurrentUser() user: RequestUser) {
    return this.approvals.decide(id, ApprovalStatus.APPROVED, user, body.reason);
  }

  @Post(':id/reject')
  reject(@Param('id') id: string, @Body() body: DecisionDto, @CurrentUser() user: RequestUser) {
    return this.approvals.decide(id, ApprovalStatus.REJECTED, user, body.reason);
  }

  @Post(':id/return')
  return_(@Param('id') id: string, @Body() body: DecisionDto, @CurrentUser() user: RequestUser) {
    return this.approvals.decide(id, ApprovalStatus.RETURNED, user, body.reason);
  }
}

@Controller('deal-health')
export class DealHealthController {
  constructor(private readonly health: DealHealthService) {}

  @Get()
  async list() {
    return { items: await this.health.list() };
  }

  @Post('scan')
  scan() {
    return this.health.scan();
  }

  @Get(':quotationId')
  async forQuote(@Param('quotationId') quotationId: string) {
    return { items: await this.health.list(quotationId) };
  }

  @Post(':id/nudge')
  nudge(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.health.nudge(id, user.id);
  }
}

@Controller('audit')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  search(
    @Query('entityType') entityType?: string,
    @Query('entityId') entityId?: string,
    @Query('page') page = '1',
  ) {
    return this.audit.search(entityType, entityId, Number(page));
  }
}

@Controller('policies/discount')
export class PolicyController {
  constructor(private readonly policies: PolicyService) {}

  @Get()
  async list() {
    return { items: await this.policies.list() };
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() body: UpdatePolicyDto, @CurrentUser() user: RequestUser) {
    return this.policies.update(id, { ...body }, user.id);
  }
}
