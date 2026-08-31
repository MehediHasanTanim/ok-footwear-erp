import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Request } from 'express';
import { PrismaService } from '@shared/database/prisma.service';
import { BomService } from '../services/bom.service';

/**
 * Blocks production-order create when the article has no approved BOM.
 * Resolves articleId from body.articleId or from body.orderId via the sales order.
 */
@Injectable()
export class ProductionBlockGuard implements CanActivate {
  constructor(
    private readonly bom: BomService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const body = request.body as { articleId?: string; orderId?: string };
    const params = request.params as { articleId?: string };
    let articleId = body?.articleId ?? params?.articleId;

    if (!articleId && body?.orderId) {
      const order = await this.prisma.order.findUnique({
        where: { id: body.orderId },
        select: { articleId: true },
      });
      articleId = order?.articleId;
    }

    if (!articleId) {
      throw new UnprocessableEntityException({
        statusCode: 422,
        message: 'articleId or orderId is required to check approved BOM',
      });
    }

    await this.bom.assertApprovedBom(articleId);
    return true;
  }
}
