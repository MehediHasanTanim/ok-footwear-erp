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
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard, type JwtPayload } from '@common/guards/jwt-auth.guard';
import { RbacGuard, Permissions } from '@common/guards/rbac.guard';
import { CurrentUser } from '@common/decorators/auth.decorator';
import { ParseUUIDPipe } from '@common/pipes/parse-uuid.pipe';
import { GratuityService } from '../services/gratuity.service';
import { GratuityEntitlementQueryDto, RunGratuityAccrualDto } from '../dto/pf-gratuity.dto';

@ApiTags('HR — Gratuity')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('hr/gratuity')
export class GratuityController {
  constructor(private readonly gratuity: GratuityService) {}

  @Post('run-monthly-accrual')
  @HttpCode(201)
  @Permissions('hr:approve')
  runMonthlyAccrual(
    @Body() dto: RunGratuityAccrualDto,
    @CurrentUser() user: JwtPayload,
  ) {
    if (!user?.sub) throw new UnauthorizedException();
    return this.gratuity.accrueMonth(dto.asOfDate, user.sub);
  }

  @Get(':employeeId/entitlement')
  @Permissions('hr:read')
  entitlement(
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
    @Query() query: GratuityEntitlementQueryDto,
  ) {
    return this.gratuity.computeEntitlement(employeeId, query.exitDate);
  }

  @Get(':employeeId/provisions')
  @Permissions('hr:read')
  provisions(@Param('employeeId', ParseUUIDPipe) employeeId: string) {
    return this.gratuity.getProvisions(employeeId);
  }
}
