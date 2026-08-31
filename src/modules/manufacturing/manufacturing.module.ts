import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';

import { ArticleBomController, BomController } from './controllers/bom.controller';
import { CostSheetsController } from './controllers/cost-sheets.controller';
import { ProductionOrdersController } from './controllers/production-orders.controller';
import { DailyProductionController } from './controllers/daily-production.controller';
import { QcResultsController } from './controllers/qc-results.controller';
import { MachinesController } from './controllers/machines.controller';
import { ScrapController } from './controllers/scrap.controller';
import { FactoryMastersController } from './controllers/factory-masters.controller';
import { BomService } from './services/bom.service';
import { CostSheetsService } from './services/cost-sheets.service';
import { ProductionOrdersService } from './services/production-orders.service';
import { DailyProductionService } from './services/daily-production.service';
import { QcResultsService } from './services/qc-results.service';
import { MachineService } from './services/machines.service';
import { ScrapService } from './services/scrap.service';
import { FactoryMastersService } from './services/factory-masters.service';
import { ProductionBlockGuard } from './guards/production-block.guard';

/**
 * Manufacturing module — Sprint 9: BOM + cost sheets.
 * Sprint 10–11: production orders, daily entry, QC, machines, scrap.
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
  controllers: [
    BomController,
    ArticleBomController,
    CostSheetsController,
    ProductionOrdersController,
    DailyProductionController,
    QcResultsController,
    MachinesController,
    ScrapController,
    FactoryMastersController,
  ],
  providers: [
    BomService,
    CostSheetsService,
    ProductionOrdersService,
    DailyProductionService,
    QcResultsService,
    MachineService,
    ScrapService,
    FactoryMastersService,
    ProductionBlockGuard,
  ],
  exports: [BomService, CostSheetsService, ProductionBlockGuard],
})
export class ManufacturingModule {}
