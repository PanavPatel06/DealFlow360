import { Module } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma.service';
import { CatalogController } from './catalog.controller';

// B3's read side only. Fulfillment, invoicing and payments have engines and
// tests but no HTTP layer yet; they land here rather than anywhere else.
@Module({
  controllers: [CatalogController],
  providers: [PrismaService],
})
export class OperationsModule {}
