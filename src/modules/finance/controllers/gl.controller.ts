import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard, type JwtPayload } from '@common/guards/jwt-auth.guard';
import { RbacGuard, Permissions } from '@common/guards/rbac.guard';
import { CurrentUser } from '@common/decorators/auth.decorator';
import { ParseUUIDPipe } from '@common/pipes/parse-uuid.pipe';
import { GlService } from '../services/gl.service';
import {
  AccountBalanceQueryDto,
  CreateGlPeriodDto,
  GlEntryQueryDto,
  PostJournalDto,
  TrialBalanceQueryDto,
  UpdateJournalDto,
} from '../dto/gl.dto';

@ApiTags('Finance — GL Entries')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('finance/gl/entries')
export class GlEntriesController {
  constructor(private readonly gl: GlService) {}

  @Get()
  @Permissions('finance:read')
  @ApiOperation({ summary: 'List GL journal entries' })
  findAll(@Query() query: GlEntryQueryDto) {
    return this.gl.findAllEntries(query);
  }

  @Get(':id')
  @Permissions('finance:read')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.gl.findOneEntry(id);
  }

  @Post()
  @HttpCode(201)
  @Permissions('finance:create')
  @ApiOperation({ summary: 'Post a balanced GL journal' })
  post(@Body() dto: PostJournalDto, @CurrentUser() user: JwtPayload) {
    if (!user?.sub) {
      throw new UnauthorizedException({ statusCode: 401, message: 'Authentication required' });
    }
    return this.gl.postJournal(dto, user.sub);
  }

  @Patch(':id')
  @Permissions('finance:update')
  @ApiOperation({ summary: 'Update a journal in an open GL period' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateJournalDto) {
    return this.gl.updateEntry(id, dto);
  }

  @Delete(':id')
  @Permissions('finance:delete')
  @HttpCode(200)
  @ApiOperation({ summary: 'Delete a journal in an open GL period' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.gl.deleteEntry(id);
  }
}

@ApiTags('Finance — GL Reports')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('finance/gl')
export class GlReportsController {
  constructor(private readonly gl: GlService) {}

  @Get('trial-balance')
  @Permissions('finance:read')
  trialBalance(@Query() query: TrialBalanceQueryDto) {
    return this.gl.trialBalance(query);
  }

  @Get('account-balance')
  @Permissions('finance:read')
  accountBalance(@Query() query: AccountBalanceQueryDto) {
    return this.gl.accountBalance(query);
  }
}

@ApiTags('Finance — GL Periods')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('finance/gl/periods')
export class GlPeriodsController {
  constructor(private readonly gl: GlService) {}

  @Get()
  @Permissions('finance:read')
  findAll() {
    return this.gl.findAllPeriods();
  }

  @Post()
  @Permissions('finance:create')
  create(@Body() dto: CreateGlPeriodDto) {
    return this.gl.createPeriod(dto);
  }

  @Post(':id/close')
  @Permissions('finance:approve')
  close(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload) {
    if (!user?.sub) {
      throw new UnauthorizedException({ statusCode: 401, message: 'Authentication required' });
    }
    return this.gl.closePeriod(id, user.sub);
  }

  @Post(':id/lock')
  @Permissions('finance:approve')
  lock(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload) {
    if (!user?.sub) {
      throw new UnauthorizedException({ statusCode: 401, message: 'Authentication required' });
    }
    return this.gl.lockPeriod(id, user.sub);
  }

  @Post(':id/unlock')
  @Permissions('finance:approve')
  @ApiOperation({ summary: 'Unlock period (locked → closed)' })
  unlock(@Param('id', ParseUUIDPipe) id: string) {
    return this.gl.unlockPeriod(id);
  }
}
