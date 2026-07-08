// =============================================================================
// NotificationsController — SSE Stream, Unread Count, Mark Read
// =============================================================================
// OK Footwear ERP — Sprint 2, System Module
// =============================================================================

import {
  Controller,
  Get,
  Patch,
  Param,
  Query,
  Sse,
  Req,
  Res,
  HttpCode,
  UseGuards,
  UnauthorizedException,
  MessageEvent,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { Observable } from 'rxjs';
import { JwtService } from '@nestjs/jwt';
import { RbacGuard, Permissions } from '@common/guards/rbac.guard';
import { JwtAuthGuard, JwtPayload } from '@common/guards/jwt-auth.guard';
import { NotificationsService } from '../services/notifications.service';
import { SSEService } from '../services/sse.service';

@ApiTags('notifications')
@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly sseService: SSEService,
    private readonly jwtService: JwtService,
  ) {}

  // =========================================================================
  // GET /notifications/stream (SSE)
  // =========================================================================
  // EventSource API cannot set custom headers, so the JWT is passed as a
  // query parameter. The token is verified manually (not via guard) because
  // guards throw HTTP exceptions, not SSE-compatible responses.

  @Sse('stream')
  @ApiOperation({ summary: 'SSE stream for real-time notifications' })
  stream(
    @Query('token') token: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Observable<MessageEvent> {
    // Validate JWT from query param
    let userId: string;
    try {
      const payload = this.jwtService.verify<JwtPayload>(token, {
        secret: process.env['JWT_SECRET'],
      });
      userId = payload.sub;
    } catch {
      // Cannot throw HTTP exception in SSE — close connection
      res.status(401).end();
      return new Observable(); // Empty — connection closed
    }

    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const subject = this.sseService.getOrCreateSubject(userId);

    // Cleanup on disconnect
    req.on('close', () => {
      this.sseService.removeConnection(userId);
    });

    return subject.asObservable();
  }

  // =========================================================================
  // GET /notifications/unread-count
  // =========================================================================

  @Get('unread-count')
  @UseGuards(JwtAuthGuard, RbacGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get unread notification count' })
  @ApiResponse({ status: 200, description: 'Unread count' })
  async unreadCount(@Req() req: Request): Promise<{ count: number }> {
    const user = (req as unknown as Record<string, unknown>)['user'] as JwtPayload;
    const count = await this.notificationsService.getUnreadCount(user.sub);
    return { count };
  }

  // =========================================================================
  // PATCH /notifications/:id/read
  // =========================================================================

  @Patch(':id/read')
  @UseGuards(JwtAuthGuard, RbacGuard)
  @HttpCode(200)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Mark a notification as read' })
  @ApiResponse({ status: 200, description: 'Marked as read' })
  @ApiResponse({ status: 404, description: 'Notification not found' })
  async markRead(
    @Param('id') id: string,
  ): Promise<{ success: boolean }> {
    const updated = await this.notificationsService.markRead(id);
    return { success: updated > 0 };
  }
}
