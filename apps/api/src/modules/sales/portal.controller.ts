import { Controller, Get, Param, Post, Req } from '@nestjs/common';
import { Public } from '../../shared/jwt-auth.guard';
import type { RequestUser } from '../../shared/current-user.decorator';
import { QuotesService } from './quotes.service';

/**
 * Separate prefix, separate guard, separate client. The token is the scope, and
 * a logged-in customer is checked against it as well.
 */
@Controller('portal/quotes')
export class PortalController {
  constructor(private readonly quotes: QuotesService) {}

  @Public() @Get(':token')
  get(@Param('token') token: string, @Req() req: { user?: RequestUser }) {
    return this.quotes.portalGet(token, req.user);
  }

  @Public() @Post(':token/confirm')
  confirm(@Param('token') token: string, @Req() req: { user?: RequestUser }) {
    return this.quotes.portalConfirm(token, req.user);
  }
}
