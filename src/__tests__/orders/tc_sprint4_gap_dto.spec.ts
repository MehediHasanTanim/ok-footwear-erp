// =============================================================================
// Sprint 4 Quotation / Complaint DTO validation
// =============================================================================

import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import {
  CreateQuotationDto,
  PopulateFromBomDto,
  ConversionRateQueryDto,
} from '@modules/orders/dto/quotations.dto';
import { UpdateComplaintStatusDto } from '@modules/orders/dto/complaints.dto';

describe('CreateQuotationDto bomVersionId', () => {
  it('accepts optional valid bomVersionId', async () => {
    const dto = plainToInstance(CreateQuotationDto, {
      currency: 'USD',
      bomVersionId: '550e8400-e29b-41d4-a716-446655440099',
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('rejects invalid bomVersionId', async () => {
    const dto = plainToInstance(CreateQuotationDto, {
      currency: 'USD',
      bomVersionId: 'not-a-uuid',
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'bomVersionId')).toBe(true);
  });
});

describe('PopulateFromBomDto', () => {
  it('requires bomVersionId UUID', async () => {
    const dto = plainToInstance(PopulateFromBomDto, {});
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'bomVersionId')).toBe(true);
  });
});

describe('ConversionRateQueryDto', () => {
  it('accepts buyerId and ISO dates', async () => {
    const dto = plainToInstance(ConversionRateQueryDto, {
      buyerId: '550e8400-e29b-41d4-a716-446655440000',
      from: '2026-01-01',
      to: '2026-06-30',
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });
});

describe('UpdateComplaintStatusDto', () => {
  it('accepts under_investigation', async () => {
    const dto = plainToInstance(UpdateComplaintStatusDto, {
      status: 'under_investigation',
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('rejects unknown status', async () => {
    const dto = plainToInstance(UpdateComplaintStatusDto, {
      status: 'closed',
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'status')).toBe(true);
  });
});
