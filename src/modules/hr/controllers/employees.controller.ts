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
import { EmployeesService } from '../services/employees.service';
import {
  CreateEmployeeDto,
  EmployeeQueryDto,
  EmployeeSecretsDto,
  TerminateEmployeeDto,
  UpdateEmployeeDto,
} from '../dto/employees.dto';

@ApiTags('HR — Employees')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('hr/employees')
export class EmployeesController {
  constructor(private readonly employees: EmployeesService) {}

  @Post()
  @HttpCode(201)
  @Permissions('hr:create')
  create(@Body() dto: CreateEmployeeDto, @CurrentUser() user: JwtPayload) {
    if (!user?.sub) throw new UnauthorizedException();
    return this.employees.create(dto, user.sub);
  }

  @Get()
  @Permissions('hr:read')
  findAll(@Query() query: EmployeeQueryDto) {
    return this.employees.findAll(query);
  }

  @Get(':id')
  @Permissions('hr:read')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.employees.findOne(id);
  }

  @Patch(':id')
  @Permissions('hr:update')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateEmployeeDto,
    @CurrentUser() user: JwtPayload,
  ) {
    if (!user?.sub) throw new UnauthorizedException();
    return this.employees.update(id, dto, user.sub);
  }

  @Post(':id/secrets')
  @Permissions('hr:update')
  updateSecrets(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: EmployeeSecretsDto,
    @CurrentUser() user: JwtPayload,
  ) {
    if (!user?.sub) throw new UnauthorizedException();
    return this.employees.updateSecrets(id, dto, user.sub);
  }

  @Get(':id/secrets/reveal')
  @Permissions('hr:approve')
  revealSecrets(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload) {
    if (!user?.sub) throw new UnauthorizedException();
    return this.employees.revealSecrets(id, user.sub);
  }

  @Post(':id/terminate')
  @Permissions('hr:approve')
  terminate(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TerminateEmployeeDto,
    @CurrentUser() user: JwtPayload,
  ) {
    if (!user?.sub) throw new UnauthorizedException();
    return this.employees.terminate(id, dto, user.sub);
  }

  @Post(':id/resign')
  @Permissions('hr:approve')
  resign(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TerminateEmployeeDto,
    @CurrentUser() user: JwtPayload,
  ) {
    if (!user?.sub) throw new UnauthorizedException();
    return this.employees.resign(id, dto, user.sub);
  }
}
