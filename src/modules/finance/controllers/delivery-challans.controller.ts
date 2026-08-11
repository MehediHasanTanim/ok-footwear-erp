import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UnauthorizedException,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard, type JwtPayload } from '@common/guards/jwt-auth.guard';
import { RbacGuard, Permissions } from '@common/guards/rbac.guard';
import { CurrentUser } from '@common/decorators/auth.decorator';
import { ParseUUIDPipe } from '@common/pipes/parse-uuid.pipe';
import { DeliveryChallansService } from '../services/delivery-challans.service';
import {
  ConfirmDeliveryDto,
  CreateDeliveryChallanDto,
  DeliveryChallanQueryDto,
  RecordPodDto,
} from '../dto/delivery-ar.dto';

@ApiTags('Finance — Delivery Challans')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('finance/delivery-challans')
export class DeliveryChallansController {
  constructor(private readonly challans: DeliveryChallansService) {}

  @Get()
  @Permissions('finance:read')
  findAll(@Query() query: DeliveryChallanQueryDto) {
    return this.challans.findAll(query);
  }

  @Get(':id')
  @Permissions('finance:read')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.challans.findOne(id);
  }

  @Post()
  @Permissions('finance:create')
  @ApiOperation({ summary: 'Create delivery challan from confirmed order' })
  create(@Body() dto: CreateDeliveryChallanDto, @CurrentUser() user: JwtPayload) {
    if (!user?.sub) {
      throw new UnauthorizedException({ statusCode: 401, message: 'Authentication required' });
    }
    return this.challans.createFromOrder(dto, user.sub);
  }

  @Post(':id/dispatch')
  @Permissions('finance:update')
  dispatch(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload) {
    if (!user?.sub) {
      throw new UnauthorizedException({ statusCode: 401, message: 'Authentication required' });
    }
    return this.challans.dispatch(id, user.sub);
  }

  @Post(':id/pod')
  @Permissions('finance:update')
  @ApiOperation({ summary: 'Record proof of delivery (optional photo)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        podDate: { type: 'string', format: 'date' },
        podReceiver: { type: 'string' },
        podNotes: { type: 'string' },
        file: { type: 'string', format: 'binary' },
      },
      required: ['podDate'],
    },
  })
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  recordPod(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RecordPodDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.challans.recordPod(
      id,
      dto,
      file
        ? { buffer: file.buffer, originalname: file.originalname, mimetype: file.mimetype }
        : undefined,
    );
  }

  @Post(':id/confirm-delivery')
  @Permissions('finance:approve')
  @ApiOperation({ summary: 'Mark delivered and auto-create AR invoice + GL' })
  confirmDelivery(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ConfirmDeliveryDto,
    @CurrentUser() user: JwtPayload,
  ) {
    if (!user?.sub) {
      throw new UnauthorizedException({ statusCode: 401, message: 'Authentication required' });
    }
    if (!dto.periodId) {
      throw new BadRequestException({ statusCode: 400, message: 'periodId is required' });
    }
    return this.challans.confirmDelivery(id, dto, user.sub);
  }
}
