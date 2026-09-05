import { forwardRef, Module } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma.service';
import { AuthController } from './auth/auth.controller';
import { AuthService } from './auth/auth.service';
import { CustomersController } from './customers.controller';
import { CustomersService } from './customers.service';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { PortalController } from './portal.controller';
import { QuoteStateService } from './quote-state.service';
import { QuotesController } from './quotes.controller';
import { QuotesService } from './quotes.service';
import { IntelligencePort, LiveIntelligence, StubTax, TaxPort } from './ports';
import { IntelligenceModule } from '../intelligence/intelligence.module';

@Module({
  imports: [forwardRef(() => IntelligenceModule)],
  controllers: [
    AuthController,
    CustomersController,
    QuotesController,
    OrdersController,
    PortalController,
  ],
  providers: [
    PrismaService,
    AuthService,
    CustomersService,
    QuotesService,
    QuoteStateService,
    OrdersService,
    // B2's engine, live. TaxPort stays stubbed until B3 exposes a tax service.
    { provide: IntelligencePort, useClass: LiveIntelligence },
    { provide: TaxPort, useClass: StubTax },
  ],
  exports: [QuoteStateService, OrdersService],
})
export class SalesModule {}
