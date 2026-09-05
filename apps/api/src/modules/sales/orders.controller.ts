import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { OrderStatus, UserRole } from '@dealflow/contracts';
import { CurrentUser, RequestUser } from '../../shared/current-user.decorator';
import { Roles } from '../../shared/jwt-auth.guard';
import { OrdersService } from './orders.service';
import { ListOrdersDto } from './dto';

@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get()
  list(@Query() query: ListOrdersDto, @CurrentUser() user: RequestUser) {
    return this.orders.list(query, user);
  }

  @Get(':id')
  get(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.orders.get(id, user);
  }

  /** Driven by B3's fulfilment updates. */
  @Patch(':id/status') @Roles(UserRole.ADMIN, UserRole.OPS)
  setStatus(@Param('id') id: string, @Body('status') status: OrderStatus, @CurrentUser() user: RequestUser) {
    return this.orders.setStatus(id, status, user.id);
  }
}
