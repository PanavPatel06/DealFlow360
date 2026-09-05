import { Module } from '@nestjs/common';
import { SalesModule } from './modules/sales/sales.module';
import { IntelligenceModule } from './modules/intelligence/intelligence.module';
import { OperationsModule } from './modules/operations/operations.module';

@Module({ imports: [SalesModule, IntelligenceModule, OperationsModule] })
export class AppModule {}
