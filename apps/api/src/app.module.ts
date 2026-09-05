import { Module } from '@nestjs/common';
import { SalesModule } from './modules/sales/sales.module';

@Module({ imports: [SalesModule] })
export class AppModule {}
