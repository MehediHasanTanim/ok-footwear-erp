import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard, type JwtPayload } from '@common/guards/jwt-auth.guard';
import { RbacGuard, Permissions } from '@common/guards/rbac.guard';
import { CurrentUser } from '@common/decorators/auth.decorator';
import { ParseUUIDPipe } from '@common/pipes/parse-uuid.pipe';
import { BomService } from '../services/bom.service';
import { CostSheetsService } from '../services/cost-sheets.service';
import { CreateBomDto, GenerateCostSheetDto, UpdateBomDto } from '../dto/bom.dto';

@ApiTags('Manufacturing — BOM')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('manufacturing/bom')
export class BomController {
  constructor(
    private readonly bom: BomService,
    private readonly costSheets: CostSheetsService,
  ) {}

  @Post()
  @HttpCode(201)
  @Permissions('manufacturing:create')
  @ApiOperation({ summary: 'Create a draft BOM version' })
  create(@Body() dto: CreateBomDto, @CurrentUser() user: JwtPayload) {
    if (!user?.sub) {
      throw new UnauthorizedException({ statusCode: 401, message: 'Authentication required' });
    }
    return this.bom.create(dto, user.sub);
  }

  @Get(':id/cost-sheet')
  @Permissions('manufacturing:read')
  findCostSheet(@Param('id', ParseUUIDPipe) id: string) {
    return this.costSheets.findByBom(id);
  }

  @Post(':id/cost-sheet')
  @HttpCode(201)
  @Permissions('manufacturing:create')
  generateCostSheet(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: GenerateCostSheetDto,
    @CurrentUser() user: JwtPayload,
  ) {
    if (!user?.sub) {
      throw new UnauthorizedException({ statusCode: 401, message: 'Authentication required' });
    }
    return this.costSheets.generate(id, dto, user.sub);
  }

  @Post(':id/approve')
  @Permissions('manufacturing:approve')
  @ApiOperation({ summary: 'Approve BOM; previous approved version is superseded' })
  approve(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload) {
    if (!user?.sub) {
      throw new UnauthorizedException({ statusCode: 401, message: 'Authentication required' });
    }
    return this.bom.approve(id, user.sub);
  }

  @Get(':id')
  @Permissions('manufacturing:read')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.bom.findOne(id);
  }

  @Patch(':id')
  @Permissions('manufacturing:update')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateBomDto) {
    return this.bom.update(id, dto);
  }

  @Delete(':id')
  @Permissions('manufacturing:delete')
  @HttpCode(200)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.bom.deleteDraft(id);
  }
}

@ApiTags('Manufacturing — Article BOM')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('articles')
export class ArticleBomController {
  constructor(private readonly bom: BomService) {}

  @Get(':id/bom/versions')
  @Permissions('manufacturing:read')
  @ApiOperation({ summary: 'BOM version history for an article' })
  versions(@Param('id', ParseUUIDPipe) id: string) {
    return this.bom.findByArticle(id);
  }

  @Get(':id/bom')
  @Permissions('manufacturing:read')
  @ApiOperation({ summary: 'Approved BOM for an article' })
  active(@Param('id', ParseUUIDPipe) id: string) {
    return this.bom.findActive(id);
  }
}
