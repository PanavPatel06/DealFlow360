import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { UserRole } from '@dealflow/contracts';
import { CurrentUser, RequestUser } from '../../shared/current-user.decorator';
import { Roles } from '../../shared/jwt-auth.guard';
import { CustomersService } from './customers.service';
import { CreateCustomerDto, ListCustomersDto, UpdateCustomerDto } from './dto';

@Controller('customers')
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  @Get()
  list(@Query() query: ListCustomersDto, @CurrentUser() user: RequestUser) {
    return this.customers.list(query, user);
  }

  @Get('tiers')
  tiers() {
    return this.customers.tiers();
  }

  @Get(':id')
  get(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.customers.get(id, user);
  }

  @Post() @Roles(UserRole.ADMIN, UserRole.SALES_REP, UserRole.SALES_MANAGER)
  create(@Body() dto: CreateCustomerDto, @CurrentUser() user: RequestUser) {
    return this.customers.create(dto, user.id);
  }

  @Patch(':id') @Roles(UserRole.ADMIN, UserRole.SALES_REP, UserRole.SALES_MANAGER)
  update(@Param('id') id: string, @Body() dto: UpdateCustomerDto, @CurrentUser() user: RequestUser) {
    return this.customers.update(id, dto, user.id);
  }
}
