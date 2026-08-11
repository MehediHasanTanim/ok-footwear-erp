import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  UseGuards,
  UnauthorizedException,
  BadRequestException,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { JwtAuthGuard, type JwtPayload } from '@common/guards/jwt-auth.guard';
import { RbacGuard, Permissions } from '@common/guards/rbac.guard';
import { CurrentUser } from '@common/decorators/auth.decorator';
import { AuditTable } from '@common/decorators/audit.decorator';
import { GoodsReceiptsService } from '../services/goods-receipts.service';
import {
  CreateGoodsReceiptDto,
  UpdateGrLineDto,
  ApproveGoodsReceiptDto,
  RejectGoodsReceiptDto,
} from '../dto/goods-receipts.dto';

@ApiTags('Procurement — Goods Receipts')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('procurement/goods-receipts')
export class GoodsReceiptsController {
  constructor(private readonly grns: GoodsReceiptsService) {}

  @Get('by-po/:poId')
  @Permissions('procurement:read')
  findByPo(@Param('poId') poId: string) {
    return this.grns.findByPo(poId);
  }

  @Post()
  @Permissions('procurement:create')
  create(@Body() dto: CreateGoodsReceiptDto, @CurrentUser() user: JwtPayload) {
    if (!user?.sub) {
      throw new UnauthorizedException({ statusCode: 401, message: 'Authentication required' });
    }
    return this.grns.create(dto, user.sub);
  }

  @Get(':id')
  @Permissions('procurement:read')
  findOne(@Param('id') id: string) {
    return this.grns.findOne(id);
  }

  @Patch(':id/lines/:lineId')
  @Permissions('procurement:update')
  updateLine(
    @Param('id') id: string,
    @Param('lineId') lineId: string,
    @Body() dto: UpdateGrLineDto,
  ) {
    return this.grns.updateLine(id, lineId, dto);
  }

  @Post(':id/submit-qc')
  @Permissions('procurement:update')
  @ApiOperation({ summary: 'Move GRN to QC pending' })
  submitQc(@Param('id') id: string) {
    return this.grns.submitForQc(id);
  }

  @Post(':id/approve')
  @Permissions('procurement:approve')
  @AuditTable('prc.goods_receipts')
  approve(
    @Param('id') id: string,
    @Body() dto: ApproveGoodsReceiptDto,
    @CurrentUser() user: JwtPayload,
  ) {
    if (!user?.sub) {
      throw new UnauthorizedException({ statusCode: 401, message: 'Authentication required' });
    }
    return this.grns.approve(id, dto, user.sub);
  }

  @Post(':id/reject')
  @Permissions('procurement:approve')
  @AuditTable('prc.goods_receipts')
  reject(@Param('id') id: string, @Body() dto: RejectGoodsReceiptDto) {
    return this.grns.reject(id, dto);
  }

  @Post(':id/lines/:lineId/photos')
  @Permissions('procurement:update')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  uploadPhoto(
    @Param('id') id: string,
    @Param('lineId') lineId: string,
    @UploadedFile() file: { buffer: Buffer; originalname: string; mimetype: string },
    @CurrentUser() user: JwtPayload,
  ) {
    if (!user?.sub) {
      throw new UnauthorizedException({ statusCode: 401, message: 'Authentication required' });
    }
    if (!file?.buffer) {
      throw new BadRequestException({
        statusCode: 422,
        message: 'File required',
        detail: 'Upload a photo under the "file" form field.',
      });
    }
    return this.grns.uploadPhoto(
      id,
      lineId,
      { buffer: file.buffer, originalname: file.originalname, mimetype: file.mimetype },
      user.sub,
    );
  }
}
