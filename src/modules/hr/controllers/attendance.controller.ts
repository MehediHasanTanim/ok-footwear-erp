import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Query,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard, type JwtPayload } from '@common/guards/jwt-auth.guard';
import { RbacGuard, Permissions } from '@common/guards/rbac.guard';
import { CurrentUser } from '@common/decorators/auth.decorator';
import { AttendanceService } from '../services/attendance.service';
import {
  AttendanceQueryDto,
  BiometricSyncDto,
  LopQueryDto,
  ManualCorrectionDto,
} from '../dto/attendance.dto';

@ApiTags('HR — Attendance')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('hr/attendance')
export class AttendanceController {
  constructor(private readonly attendance: AttendanceService) {}

  @Post('biometric-sync')
  @HttpCode(201)
  @Permissions('hr:create')
  biometricSync(@Body() dto: BiometricSyncDto) {
    return this.attendance.biometricSync(dto);
  }

  @Post('corrections')
  @HttpCode(201)
  @Permissions('hr:update')
  manualCorrection(@Body() dto: ManualCorrectionDto, @CurrentUser() user: JwtPayload) {
    if (!user?.sub) throw new UnauthorizedException();
    return this.attendance.manualCorrection(dto, user.sub);
  }

  @Get()
  @Permissions('hr:read')
  findByEmployee(@Query() query: AttendanceQueryDto) {
    return this.attendance.findByEmployee(query);
  }

  @Get('lop')
  @Permissions('hr:read')
  calculateLop(@Query() query: LopQueryDto) {
    return this.attendance.calculateLop(query.employeeId, query.month, query.year);
  }
}
