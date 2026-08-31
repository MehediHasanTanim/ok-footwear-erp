import { BadRequestException } from '@nestjs/common';

export type ProductionOrderStatus = 'planned' | 'in_progress' | 'completed' | 'on_hold';

export const PRODUCTION_STATUS_TRANSITIONS: Record<
  ProductionOrderStatus,
  ProductionOrderStatus[]
> = {
  planned: ['in_progress', 'on_hold'],
  in_progress: ['completed', 'on_hold'],
  on_hold: ['in_progress'],
  completed: [],
};

export function validateProductionTransition(
  from: ProductionOrderStatus,
  to: ProductionOrderStatus,
): void {
  const allowed = PRODUCTION_STATUS_TRANSITIONS[from] ?? [];
  if (!allowed.includes(to)) {
    throw new BadRequestException({
      statusCode: 400,
      message: `Invalid production order transition: ${from} → ${to}`,
    });
  }
}
