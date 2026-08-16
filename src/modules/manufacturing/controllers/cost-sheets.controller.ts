import { Body, Controller, Param, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { RbacGuard, Permissions } from '@common/guards/rbac.guard';
import { ParseUUIDPipe } from '@common/pipes/parse-uuid.pipe';
import { CostSheetsService } from '../services/cost-sheets.service';
import { UpdateCostSheetDto } from '../dto/bom.dto';

@ApiTags('Manufacturing — Cost sheets')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('manufacturing/cost-sheets')
export class CostSheetsController {
  constructor(private readonly costSheets: CostSheetsService) {}

  @Patch(':id')
  @Permissions('manufacturing:update')
  @ApiOperation({ summary: 'Update draft cost sheet target margin and selling price' })
  updateMargin(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCostSheetDto) {
    return this.costSheets.updateMargin(id, dto.targetMarginPct);
  }
}
