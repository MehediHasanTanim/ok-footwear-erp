import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

/**
 * Health check endpoint for liveness/readiness probes.
 *
 * Kubernetes uses this for:
 * - livenessProbe: GET /api/v1/health (container restart if failing)
 * - readinessProbe: GET /api/v1/health (remove from service if failing)
 *
 * Currently returns a static response. In Sprint 3+, this will check
 * database and Redis connectivity before returning 200.
 */
@ApiTags('Health')
@Controller('health')
export class HealthController {
  @Get()
  @ApiOperation({ summary: 'Health check — liveness & readiness probe' })
  check(): { status: string; timestamp: string; uptime: number } {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    };
  }
}
