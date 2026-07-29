// =============================================================================
// TC-BUYERS-SVC — BuyersService Unit Tests
// =============================================================================
// OK Footwear ERP — Sprint 3
//
// Acceptance Tests Covered:
//   9. GET /buyers?dropdown=true returns only id + name
// =============================================================================

import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { BuyersService } from '@modules/orders/services/buyers.service';
import { PrismaService } from '@shared/database/prisma.service';
import { CreateBuyerDto, UpdateBuyerDto, BuyerQueryDto, PaymentTerm } from '@modules/orders/dto/buyers.dto';

const mockPrisma = {
  buyer: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  },
  $queryRaw: jest.fn(),
};

describe('BuyersService', () => {
  let service: BuyersService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BuyersService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<BuyersService>(BuyersService);
    jest.clearAllMocks();
  });

  // =========================================================================
  // Acceptance Test 9: Dropdown mode
  // =========================================================================

  describe('findAll() — dropdown mode', () => {
    it('should return only id + name when dropdown=true', async () => {
      mockPrisma.buyer.findMany.mockResolvedValue([
        { id: 'b-1', name: 'Nike' },
        { id: 'b-2', name: 'Adidas' },
      ]);
      mockPrisma.buyer.count.mockResolvedValue(2);

      const query: BuyerQueryDto = {
        page: 1,
        limit: 20,
        dropdown: true,
      };

      const result = await service.findAll(query);

      expect(result.data).toEqual([
        { id: 'b-1', name: 'Nike' },
        { id: 'b-2', name: 'Adidas' },
      ]);

      // Verify select was called with only id + name
      const findManyCall = mockPrisma.buyer.findMany.mock.calls[0][0] as Record<string, unknown>;
      expect(findManyCall['select']).toEqual({ id: true, name: true });
    });

    it('should return full payload when dropdown=false', async () => {
      mockPrisma.buyer.findMany.mockResolvedValue([
        {
          id: 'b-1',
          name: 'Nike',
          currency: 'USD',
          paymentTerms: 'LC_SIGHT',
          creditLimit: 500000,
          country: 'USA',
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);
      mockPrisma.buyer.count.mockResolvedValue(1);

      const query: BuyerQueryDto = { page: 1, limit: 20, dropdown: false };
      const result = await service.findAll(query);

      const findManyCall = mockPrisma.buyer.findMany.mock.calls[0][0] as Record<string, unknown>;
      const select = findManyCall['select'] as Record<string, boolean>;

      // Verify full select shape
      expect(select.id).toBe(true);
      expect(select.name).toBe(true);
      expect(select.currency).toBe(true);
      expect(select.paymentTerms).toBe(true);
      expect(select.creditLimit).toBe(true);
      expect(select.country).toBe(true);
    });
  });

  // =========================================================================
  // CRUD tests
  // =========================================================================

  describe('findOne()', () => {
    it('should return a buyer by ID', async () => {
      const buyer = { id: 'b-1', name: 'Nike', deletedAt: null };
      mockPrisma.buyer.findUnique.mockResolvedValue(buyer);

      const result = await service.findOne('b-1');
      expect(result).toEqual(buyer);
    });

    it('should throw NotFoundException for missing buyer', async () => {
      mockPrisma.buyer.findUnique.mockResolvedValue(null);
      await expect(service.findOne('b-1')).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException for soft-deleted buyer', async () => {
      mockPrisma.buyer.findUnique.mockResolvedValue({
        id: 'b-1',
        name: 'Nike',
        deletedAt: new Date(),
      });
      await expect(service.findOne('b-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('create()', () => {
    it('should create a buyer with uppercase currency', async () => {
      mockPrisma.buyer.create.mockResolvedValue({
        id: 'b-1',
        name: 'Nike',
        currency: 'USD',
      });

      const dto: CreateBuyerDto = {
        name: 'Nike',
        currency: 'usd',
        paymentTerms: PaymentTerm.LC_SIGHT,
      };

      const result = await service.create(dto);
      expect(result.currency).toBe('USD');
      expect(mockPrisma.buyer.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ currency: 'USD' }),
      });
    });
  });

  describe('softDelete()', () => {
    it('should soft-delete a buyer (never hard delete)', async () => {
      mockPrisma.buyer.findUnique.mockResolvedValue({
        id: 'b-1',
        name: 'Nike',
        deletedAt: null,
      });
      mockPrisma.buyer.update.mockResolvedValue({
        id: 'b-1',
        isActive: false,
        deletedAt: new Date(),
      });

      await service.softDelete('b-1');

      expect(mockPrisma.buyer.update).toHaveBeenCalledWith({
        where: { id: 'b-1' },
        data: expect.objectContaining({
          isActive: false,
          deletedAt: expect.any(Date),
        }),
      });
    });
  });
  describe('findAll() — trigram search', () => {
    it('should use similarity query when search is provided', async () => {
      mockPrisma.$queryRaw
        .mockResolvedValueOnce([{ id: 'b-1' }])
        .mockResolvedValueOnce([{ count: BigInt(1) }]);
      mockPrisma.buyer.findMany.mockResolvedValue([{ id: 'b-1', name: 'Nike' }]);

      const result = await service.findAll({
        page: 1,
        limit: 20,
        search: 'Nkie',
      });

      expect(mockPrisma.$queryRaw).toHaveBeenCalled();
      expect(result.data).toEqual([{ id: 'b-1', name: 'Nike' }]);
      expect(result.meta.totalItems).toBe(1);
    });
  });
});

describe('BuyerQueryDto dropdown transform', () => {
  it('should coerce query string "true" to boolean true', () => {
    const dto = plainToInstance(BuyerQueryDto, { dropdown: 'true', page: '1', limit: '20' });
    expect(dto.dropdown).toBe(true);
  });

  it('should coerce query string "false" to boolean false', () => {
    const dto = plainToInstance(BuyerQueryDto, { dropdown: 'false' });
    expect(dto.dropdown).toBe(false);
  });
});
