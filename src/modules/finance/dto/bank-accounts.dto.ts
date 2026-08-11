import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { PaginationDto } from '@common/dto/pagination.dto';

export const BANK_ACCOUNT_TYPES = ['current', 'savings', 'od', 'lc'] as const;

export class BankAccountQueryDto extends PaginationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  isActive?: boolean;
}

export class CreateBankAccountDto {
  @ApiProperty()
  @IsString()
  @MaxLength(200)
  accountName!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(200)
  bankName!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  branch?: string;

  @ApiProperty()
  @IsString()
  accountNumber!: string;

  @ApiProperty({ enum: BANK_ACCOUNT_TYPES })
  @IsIn(BANK_ACCOUNT_TYPES)
  accountType!: (typeof BANK_ACCOUNT_TYPES)[number];

  @ApiPropertyOptional({ default: 'BDT' })
  @IsOptional()
  @IsString()
  @MaxLength(3)
  currency?: string;

  @ApiProperty({ description: 'Linked GL cash/bank account' })
  @IsUUID()
  glAccountId!: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isPayroll?: boolean;
}

export class UpdateBankAccountDto extends PartialType(CreateBankAccountDto) {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class BankTxnQueryDto extends PaginationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  isReconciled?: boolean;
}

export class ImportStatementDto {
  @ApiProperty({ enum: ['csv', 'ofx'] })
  @IsIn(['csv', 'ofx'])
  format!: 'csv' | 'ofx';
}
