import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  UnauthorizedException,
  HttpCode,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard, type JwtPayload } from '@common/guards/jwt-auth.guard';
import { RbacGuard, Permissions } from '@common/guards/rbac.guard';
import { CurrentUser } from '@common/decorators/auth.decorator';
import { VendorsService } from '../services/vendors.service';
import {
  CreateVendorCategoryDto,
  UpdateVendorCategoryDto,
  CreateVendorDto,
  UpdateVendorDto,
  VendorQueryDto,
} from '../dto/vendors.dto';

@ApiTags('Procurement — Vendors')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('procurement')
export class VendorsController {
  constructor(private readonly vendors: VendorsService) {}

  // ---- Vendor categories ----

  @Get('vendor-categories')
  @Permissions('procurement:read')
  @ApiOperation({ summary: 'List vendor categories' })
  listCategories() {
    return this.vendors.findAllCategories();
  }

  @Post('vendor-categories')
  @Permissions('procurement:create')
  @ApiOperation({ summary: 'Create vendor category' })
  createCategory(@Body() dto: CreateVendorCategoryDto) {
    return this.vendors.createCategory(dto);
  }

  @Patch('vendor-categories/:id')
  @Permissions('procurement:update')
  @ApiOperation({ summary: 'Update vendor category' })
  updateCategory(@Param('id') id: string, @Body() dto: UpdateVendorCategoryDto) {
    return this.vendors.updateCategory(id, dto);
  }

  @Delete('vendor-categories/:id')
  @Permissions('procurement:delete')
  @HttpCode(200)
  @ApiOperation({ summary: 'Delete vendor category (blocked if vendors assigned)' })
  deleteCategory(@Param('id') id: string) {
    return this.vendors.deleteCategory(id);
  }

  // ---- Vendors ----

  @Get('vendors')
  @Permissions('procurement:read')
  @ApiOperation({ summary: 'List vendors' })
  findAll(@Query() query: VendorQueryDto) {
    return this.vendors.findAll(query);
  }

  @Post('vendors')
  @Permissions('procurement:create')
  @ApiOperation({ summary: 'Create vendor' })
  create(@Body() dto: CreateVendorDto, @CurrentUser() user: JwtPayload) {
    if (!user?.sub) {
      throw new UnauthorizedException({ statusCode: 401, message: 'Authentication required' });
    }
    return this.vendors.create(dto, user.sub);
  }

  @Get('vendors/:id')
  @Permissions('procurement:read')
  findOne(@Param('id') id: string) {
    return this.vendors.findOne(id);
  }

  @Patch('vendors/:id')
  @Permissions('procurement:update')
  @ApiOperation({ summary: 'Update vendor' })
  update(@Param('id') id: string, @Body() dto: UpdateVendorDto) {
    return this.vendors.update(id, dto);
  }

  @Delete('vendors/:id')
  @Permissions('procurement:delete')
  @HttpCode(200)
  @ApiOperation({ summary: 'Delete vendor (blocked if POs or invoices exist)' })
  remove(@Param('id') id: string) {
    return this.vendors.remove(id);
  }
}
