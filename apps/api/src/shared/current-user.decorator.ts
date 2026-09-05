import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export type RequestUser = { id: string; role: string; customerId?: string };

/** B1 owns auth. Until the JWT guard lands, the request carries whatever it carries. */
export const CurrentUser = createParamDecorator(
  (_d: unknown, ctx: ExecutionContext): RequestUser =>
    ctx.switchToHttp().getRequest().user ?? { id: 'system', role: 'SALES_MANAGER' },
);
