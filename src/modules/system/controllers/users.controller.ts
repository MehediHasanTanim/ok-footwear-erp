// =============================================================================
// UsersController — User Management Endpoints
// =============================================================================
// OK Footwear ERP — Sprint 2, System Module
// =============================================================================

import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { RbacGuard, Permissions } from '@common/guards/rbac.guard';
import { UsersService } from '../services/users.service';
import { CreateUserDto, UpdateUserDto, UserQueryDto } from '../dto/users.dto';

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
@UseGuards(JwtAuthGuard, RbacGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  // =========================================================================
  // GET /users
  // =========================================================================

  @Get()
  @Permissions('system:read')
  @ApiOperation({ summary: 'List users (paginated, searchable)' })
  @ApiResponse({ status: 200, description: 'Paginated user list' })
  findAll(@Query() query: UserQueryDto) {
    return this.usersService.findAll(query);
  }

  // =========================================================================
  // GET /users/:id
  // =========================================================================

  @Get(':id')
  @Permissions('system:read')
  @ApiOperation({ summary: 'Get user by ID' })
  @ApiResponse({ status: 200, description: 'User detail' })
  @ApiResponse({ status: 404, description: 'User not found' })
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  // =========================================================================
  // POST /users
  // =========================================================================

  @Post()
  @Permissions('system:create')
  @ApiOperation({ summary: 'Create a new user' })
  @ApiResponse({ status: 201, description: 'User created' })
  @ApiResponse({ status: 409, description: 'Email already exists' })
  @HttpCode(201)
  create(@Body() dto: CreateUserDto) {
    return this.usersService.create(dto);
  }

  // =========================================================================
  // PATCH /users/:id
  // =========================================================================

  @Patch(':id')
  @Permissions('system:update')
  @ApiOperation({ summary: 'Update user fields' })
  @ApiResponse({ status: 200, description: 'User updated' })
  @ApiResponse({ status: 404, description: 'User not found' })
  update(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.usersService.update(id, dto);
  }

  // =========================================================================
  // DELETE /users/:id (soft delete)
  // =========================================================================

  @Delete(':id')
  @Permissions('system:delete')
  @HttpCode(204)
  @ApiOperation({ summary: 'Soft-delete a user (sets is_active=false)' })
  @ApiResponse({ status: 204, description: 'User deactivated' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async softDelete(@Param('id') id: string): Promise<void> {
    await this.usersService.softDelete(id);
  }

  // =========================================================================
  // POST /users/:id/roles
  // =========================================================================

  @Post(':id/roles')
  @Permissions('system:update')
  @HttpCode(200)
  @ApiOperation({ summary: 'Assign a role to a user' })
  @ApiResponse({ status: 200, description: 'Role assigned' })
  assignRole(
    @Param('id') userId: string,
    @Body('roleId') roleId: string,
  ) {
    return this.usersService.assignRole(userId, roleId);
  }

  // =========================================================================
  // DELETE /users/:id/roles/:roleId
  // =========================================================================

  @Delete(':id/roles/:roleId')
  @Permissions('system:delete')
  @HttpCode(204)
  @ApiOperation({ summary: 'Remove a role from a user' })
  @ApiResponse({ status: 204, description: 'Role removed' })
  async removeRole(
    @Param('id') userId: string,
    @Param('roleId') roleId: string,
  ): Promise<void> {
    await this.usersService.removeRole(userId, roleId);
  }

  // =========================================================================
  // POST /users/:id/link-employee
  // =========================================================================

  @Post(':id/link-employee')
  @Permissions('system:update')
  @HttpCode(200)
  @ApiOperation({ summary: 'Link user to an employee record' })
  @ApiResponse({ status: 200, description: 'Employee linked' })
  linkEmployee(
    @Param('id') userId: string,
    @Body('employeeId') employeeId: string,
  ) {
    return this.usersService.linkEmployee(userId, employeeId);
  }
}
