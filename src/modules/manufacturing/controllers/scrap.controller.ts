import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard, type JwtPayload } from '@common/guards/jwt-auth.guard';
import { RbacGuard, Permissions } from '@common/guards/rbac.guard';
import { CurrentUser } from '@common/decorators/auth.decorator';
import { ParseUUIDPipe } from '@common/pipes/parse-uuid.pipe';
import { ScrapService } from '../services/scrap.service';
import { AuthorizeDisposalDto, CreateScrapDto } from '../dto/production.dto';

@ApiTags('Manufacturing — Scrap')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller()
export class ScrapController {
  constructor(private readonly scrap: ScrapService) {}

  @Post('manufacturing/production-orders/:poId/scrap')
  @HttpCode(201)
  @Permissions('manufacturing:create')
  create(
    @Param('poId', ParseUUIDPipe) poId: string,
    @Body() dto: CreateScrapDto,
    @CurrentUser() user: JwtPayload,
  ) {
    if (!user?.sub) {
      throw new UnauthorizedException({ statusCode: 401, message: 'Authentication required' });
    }
    return this.scrap.create(poId, dto, user.sub);
  }

  @Get('manufacturing/production-orders/:poId/scrap')
  @Permissions('manufacturing:read')
  list(@Param('poId', ParseUUIDPipe) poId: string) {
    return this.scrap.list(poId);
  }

  @Patch('manufacturing/scrap/:id/dispose')
  @Permissions('manufacturing:approve')
  authorizeDisposal(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AuthorizeDisposalDto,
    @CurrentUser() user: JwtPayload,
  ) {
    if (!user?.sub) {
      throw new UnauthorizedException({ statusCode: 401, message: 'Authentication required' });
    }
    return this.scrap.authorizeDisposal(id, dto, user.sub);
  }
}
