// =============================================================================
// RolesController — Role & Permission Management
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
  HttpCode,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { RbacGuard, Permissions } from '@common/guards/rbac.guard';
import { RolesService } from '../services/roles.service';
import { CreateRoleDto, UpdateRoleDto, AddPermissionDto } from '../dto/roles.dto';

@ApiTags('roles')
@ApiBearerAuth()
@Controller()
@UseGuards(JwtAuthGuard, RbacGuard)
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  // =========================================================================
  // GET /roles
  // =========================================================================

  @Get('roles')
  @Permissions('system:read')
  @ApiOperation({ summary: 'List all roles' })
  findAll() {
    return this.rolesService.findAll();
  }

  // =========================================================================
  // GET /roles/:id
  // =========================================================================

  @Get('roles/:id')
  @Permissions('system:read')
  @ApiOperation({ summary: 'Get a role with its permissions' })
  findOne(@Param('id') id: string) {
    return this.rolesService.findOne(id);
  }

  // =========================================================================
  // POST /roles
  // =========================================================================

  @Post('roles')
  @Permissions('system:create')
  @HttpCode(201)
  @ApiOperation({ summary: 'Create a new role' })
  create(@Body() dto: CreateRoleDto) {
    return this.rolesService.create(dto);
  }

  // =========================================================================
  // PATCH /roles/:id
  // =========================================================================

  @Patch('roles/:id')
  @Permissions('system:update')
  @ApiOperation({ summary: 'Update a role' })
  update(@Param('id') id: string, @Body() dto: UpdateRoleDto) {
    return this.rolesService.update(id, dto);
  }

  // =========================================================================
  // DELETE /roles/:id
  // =========================================================================

  @Delete('roles/:id')
  @Permissions('system:delete')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete a role (no users assigned)' })
  async delete(@Param('id') id: string): Promise<void> {
    await this.rolesService.delete(id);
  }

  // =========================================================================
  // POST /roles/:id/permissions
  // =========================================================================

  @Post('roles/:id/permissions')
  @Permissions('system:update')
  @HttpCode(200)
  @ApiOperation({ summary: 'Add a permission to a role (by permissionId or module+action)' })
  addPermission(
    @Param('id') roleId: string,
    @Body() body: AddPermissionDto,
  ) {
    return this.rolesService.addPermission(roleId, body);
  }

  // =========================================================================
  // DELETE /roles/:id/permissions/:permId
  // =========================================================================

  @Delete('roles/:id/permissions/:permId')
  @Permissions('system:delete')
  @HttpCode(204)
  @ApiOperation({ summary: 'Remove a permission from a role' })
  async removePermission(
    @Param('id') roleId: string,
    @Param('permId') permissionId: string,
  ): Promise<void> {
    await this.rolesService.removePermission(roleId, permissionId);
  }

  // =========================================================================
  // GET /permissions
  // =========================================================================

  @Get('permissions')
  @Permissions('system:read')
  @ApiOperation({ summary: 'List all available permissions with IDs' })
  @ApiResponse({ status: 200, description: 'List of permissions' })
  findAllPermissions() {
    return this.rolesService.findAllPermissions();
  }

  // =========================================================================
  // GET /permissions/matrix
  // =========================================================================

  @Get('permissions/matrix')
  @Permissions('system:read')
  @ApiOperation({ summary: 'Get permission matrix (modules × actions)' })
  @ApiResponse({ status: 200, description: 'Permission matrix' })
  getPermissionMatrix() {
    return this.rolesService.getPermissionMatrix();
  }
}
