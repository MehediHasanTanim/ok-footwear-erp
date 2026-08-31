import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard, type JwtPayload } from '@common/guards/jwt-auth.guard';
import { RbacGuard, Permissions } from '@common/guards/rbac.guard';
import { CurrentUser } from '@common/decorators/auth.decorator';
import { ParseUUIDPipe } from '@common/pipes/parse-uuid.pipe';
import { QcResultsService } from '../services/qc-results.service';
import { AqlSampleSizeQueryDto, CreateQcResultDto } from '../dto/production.dto';

@ApiTags('Manufacturing — QC')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller()
export class QcResultsController {
  constructor(private readonly qc: QcResultsService) {}

  @Get('manufacturing/qc/aql-sample-size')
  @Permissions('manufacturing:read')
  @ApiOperation({ summary: 'Calculate AQL Level II sample size for a lot' })
  aqlSampleSize(@Query() query: AqlSampleSizeQueryDto) {
    return this.qc.getAqlSampleSize(query.lotSize);
  }

  @Post('manufacturing/production-orders/:poId/qc')
  @HttpCode(201)
  @Permissions('manufacturing:create')
  create(
    @Param('poId', ParseUUIDPipe) poId: string,
    @Body() dto: CreateQcResultDto,
    @CurrentUser() user: JwtPayload,
  ) {
    if (!user?.sub) {
      throw new UnauthorizedException({ statusCode: 401, message: 'Authentication required' });
    }
    return this.qc.create(poId, dto, user.sub);
  }

  @Get('manufacturing/production-orders/:poId/qc')
  @Permissions('manufacturing:read')
  list(@Param('poId', ParseUUIDPipe) poId: string) {
    return this.qc.list(poId);
  }
}
