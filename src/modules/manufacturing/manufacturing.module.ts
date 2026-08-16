import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';

import { ArticleBomController, BomController } from './controllers/bom.controller';
import { CostSheetsController } from './controllers/cost-sheets.controller';
import { BomService } from './services/bom.service';
import { CostSheetsService } from './services/cost-sheets.service';
import { ProductionBlockGuard } from './guards/production-block.guard';

/**
 * Manufacturing module — Sprint 9: BOM versioning and cost sheets.
 * ProductionBlockGuard is exported for Sprint 10 production-order create.
 */
@Module({
  imports: [
    JwtModule.register({
      secret: process.env['JWT_SECRET'] ?? 'dev-secret-do-not-use-in-production',
      signOptions: {
        expiresIn: (process.env['JWT_ACCESS_TTL'] ?? '8h') as unknown as number,
      },
    }),
  ],
  controllers: [BomController, ArticleBomController, CostSheetsController],
  providers: [BomService, CostSheetsService, ProductionBlockGuard],
  exports: [BomService, CostSheetsService, ProductionBlockGuard],
})
export class ManufacturingModule {}
