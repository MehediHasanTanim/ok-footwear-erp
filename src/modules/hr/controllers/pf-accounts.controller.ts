import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { RbacGuard, Permissions } from '@common/guards/rbac.guard';
import { ParseUUIDPipe } from '@common/pipes/parse-uuid.pipe';
import { PfService } from '../services/pf.service';
import { EnrollPfDto, PfContributionDto, PfStatementQueryDto } from '../dto/pf-gratuity.dto';

@ApiTags('HR — PF Accounts')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('hr/pf-accounts')
export class PfAccountsController {
  constructor(private readonly pf: PfService) {}

  @Post('enroll')
  @HttpCode(201)
  @Permissions('hr:create')
  enroll(@Body() dto: EnrollPfDto) {
    return this.pf.enroll(dto.employeeId, dto.enrolledDate);
  }

  @Get('contributions/calculate')
  @Permissions('hr:read')
  calculateContribution(@Query('basic') basic: string) {
    return this.pf.calculateContribution(Number(basic));
  }

  @Get('employee/:employeeId')
  @Permissions('hr:read')
  findByEmployee(@Param('employeeId', ParseUUIDPipe) employeeId: string) {
    return this.pf.findByEmployee(employeeId);
  }

  @Post(':id/contributions')
  @Permissions('hr:create')
  recordContribution(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PfContributionDto,
  ) {
    return this.pf.recordContribution(id, dto);
  }

  @Get(':id/statement')
  @Permissions('hr:read')
  statement(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: PfStatementQueryDto,
  ) {
    return this.pf.getStatement(id, query.fromDate, query.toDate);
  }
}
