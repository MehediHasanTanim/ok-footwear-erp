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
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard, type JwtPayload } from '@common/guards/jwt-auth.guard';
import { RbacGuard, Permissions } from '@common/guards/rbac.guard';
import { CurrentUser } from '@common/decorators/auth.decorator';
import { ParseUUIDPipe } from '@common/pipes/parse-uuid.pipe';
import { LeaveService } from '../services/leave.service';
import {
  ApplyLeaveDto,
  ApproveLeaveDto,
  CarryForwardDto,
  CreateLeaveTypeDto,
  LeaveBalanceQueryDto,
  RejectLeaveDto,
  UpdateLeaveTypeDto,
} from '../dto/leave.dto';

@ApiTags('HR — Leave Types')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('hr/leave-types')
export class LeaveTypesController {
  constructor(private readonly leave: LeaveService) {}

  @Post()
  @HttpCode(201)
  @Permissions('hr:create')
  create(@Body() dto: CreateLeaveTypeDto) {
    return this.leave.createLeaveType(dto);
  }

  @Get()
  @Permissions('hr:read')
  list(@Query('activeOnly') activeOnly?: string) {
    return this.leave.listLeaveTypes(activeOnly !== 'false');
  }

  @Patch(':id')
  @Permissions('hr:update')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateLeaveTypeDto) {
    return this.leave.updateLeaveType(id, dto);
  }
}

@ApiTags('HR — Leave Requests')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('hr/leave-requests')
export class LeaveRequestsController {
  constructor(private readonly leave: LeaveService) {}

  @Post('apply')
  @HttpCode(201)
  @Permissions('hr:create')
  apply(@Body() dto: ApplyLeaveDto) {
    return this.leave.apply(dto);
  }

  @Patch(':id/approve')
  @Permissions('hr:approve')
  approve(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApproveLeaveDto,
    @CurrentUser() user: JwtPayload,
  ) {
    if (!user?.sub) throw new UnauthorizedException();
    return this.leave.approve(id, dto, user.sub);
  }

  @Patch(':id/reject')
  @Permissions('hr:approve')
  reject(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RejectLeaveDto) {
    return this.leave.reject(id, dto);
  }

  @Patch(':id/cancel')
  @Permissions('hr:update')
  cancel(@Param('id', ParseUUIDPipe) id: string) {
    return this.leave.cancel(id);
  }
}

@ApiTags('HR — Leave Balances')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('hr/leave-balances')
export class LeaveBalancesController {
  constructor(private readonly leave: LeaveService) {}

  @Get()
  @Permissions('hr:read')
  getBalance(@Query() query: LeaveBalanceQueryDto) {
    return this.leave.getBalance(query.employeeId, query.year);
  }

  @Post('carry-forward')
  @Permissions('hr:approve')
  carryForward(@Body() dto: CarryForwardDto) {
    return this.leave.carryForward(dto);
  }
}
