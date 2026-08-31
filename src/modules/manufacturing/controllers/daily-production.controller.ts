import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
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
import { DailyProductionService } from '../services/daily-production.service';
import {
  DailyProductionQueryDto,
  RecordDailyProductionDto,
  UpdateDailyProductionDto,
} from '../dto/production.dto';

@ApiTags('Manufacturing — Daily Production')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller()
export class DailyProductionController {
  constructor(private readonly daily: DailyProductionService) {}

  @Post('manufacturing/production-orders/:poId/daily')
  @HttpCode(201)
  @Permissions('manufacturing:create')
  record(
    @Param('poId', ParseUUIDPipe) poId: string,
    @Body() dto: RecordDailyProductionDto,
    @CurrentUser() user: JwtPayload,
  ) {
    if (!user?.sub) {
      throw new UnauthorizedException({ statusCode: 401, message: 'Authentication required' });
    }
    return this.daily.record(poId, dto, user.sub);
  }

  @Get('manufacturing/production-orders/:poId/daily')
  @Permissions('manufacturing:read')
  list(
    @Param('poId', ParseUUIDPipe) poId: string,
    @Query() query: DailyProductionQueryDto,
  ) {
    return this.daily.list(poId, query);
  }

  @Patch('manufacturing/daily-productions/:id')
  @Permissions('manufacturing:update')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateDailyProductionDto) {
    return this.daily.update(id, dto);
  }
}
