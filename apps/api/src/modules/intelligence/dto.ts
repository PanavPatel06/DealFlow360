import { IsArray, IsInt, IsOptional, IsString, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class DecisionDto {
  @IsOptional() @IsString() reason?: string;
}

export class AllocationLineDto {
  @IsString() warehouseId!: string;
  @IsString() productId!: string;
  @IsInt() @Min(1) qty!: number;
}

export class ReserveDto {
  @IsArray() @ValidateNested({ each: true }) @Type(() => AllocationLineDto)
  allocations!: AllocationLineDto[];
}

export class UpdatePolicyDto {
  @IsOptional() @IsInt() @Min(0) maxDiscountBps?: number;
  @IsOptional() @IsInt() @Min(0) requiresManagerAboveBps?: number;
  @IsOptional() @IsInt() @Min(0) requiresFinanceAboveBps?: number;
  @IsOptional() @IsInt() @Min(0) targetMarginBps?: number;
  @IsOptional() @IsInt() @Min(1) stalledAfterDays?: number;
}
