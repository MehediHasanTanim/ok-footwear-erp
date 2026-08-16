import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Request } from 'express';
import { BomService } from '../services/bom.service';

/**
 * Blocks production-order create when the article has no approved BOM.
 * Apply on Sprint 10 POST /manufacturing/production-orders:
 *   @UseGuards(JwtAuthGuard, RbacGuard, ProductionBlockGuard)
 */
@Injectable()
export class ProductionBlockGuard implements CanActivate {
  constructor(private readonly bom: BomService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const body = request.body as { articleId?: string };
    const params = request.params as { articleId?: string };
    const articleId = body?.articleId ?? params?.articleId;
    if (!articleId) {
      throw new UnprocessableEntityException({
        statusCode: 422,
        message: 'articleId is required to check approved BOM',
      });
    }
    await this.bom.assertApprovedBom(articleId);
    return true;
  }
}
