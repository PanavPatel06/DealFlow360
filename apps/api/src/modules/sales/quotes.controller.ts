import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { UserRole } from '@dealflow/contracts';
import { CurrentUser, RequestUser } from '../../shared/current-user.decorator';
import { Roles } from '../../shared/jwt-auth.guard';
import { QuotesService } from './quotes.service';
import { CreateLineDto, CreateQuoteDto, ListQuotesDto, UpdateLineDto, UpdateQuoteDto } from './dto';

const SALES = [UserRole.ADMIN, UserRole.SALES_REP, UserRole.SALES_MANAGER] as const;

@Controller('quotes')
export class QuotesController {
  constructor(private readonly quotes: QuotesService) {}

  @Get()
  list(@Query() query: ListQuotesDto, @CurrentUser() user: RequestUser) {
    return this.quotes.list(query, user);
  }

  @Get(':id')
  get(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.quotes.get(id, user);
  }

  @Post() @Roles(...SALES)
  create(@Body() dto: CreateQuoteDto, @CurrentUser() user: RequestUser) {
    return this.quotes.create(dto, user);
  }

  @Patch(':id') @Roles(...SALES)
  update(@Param('id') id: string, @Body() dto: UpdateQuoteDto, @CurrentUser() user: RequestUser) {
    return this.quotes.update(id, dto, user);
  }

  @Post(':id/lines') @Roles(...SALES)
  addLine(@Param('id') id: string, @Body() dto: CreateLineDto, @CurrentUser() user: RequestUser) {
    return this.quotes.addLine(id, dto, user);
  }

  @Patch(':id/lines/:lineId') @Roles(...SALES)
  updateLine(
    @Param('id') id: string,
    @Param('lineId') lineId: string,
    @Body() dto: UpdateLineDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.quotes.updateLine(id, lineId, dto, user);
  }

  @Delete(':id/lines/:lineId') @Roles(...SALES)
  removeLine(@Param('id') id: string, @Param('lineId') lineId: string, @CurrentUser() user: RequestUser) {
    return this.quotes.removeLine(id, lineId, user);
  }

  @Post(':id/submit') @Roles(...SALES)
  submit(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.quotes.submit(id, user);
  }

  @Post(':id/confirm') @Roles(...SALES)
  confirm(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.quotes.confirm(id, user);
  }
}
