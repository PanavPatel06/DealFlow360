import { Type } from 'class-transformer';
import {
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
  MinLength,
} from 'class-validator';
import { LineType, UserRole } from '@dealflow/contracts';

export class LoginDto {
  @IsEmail() email!: string;
  @IsString() @MinLength(6) password!: string;
}

export class SignupDto extends LoginDto {
  @IsString() @MinLength(2) name!: string;
  @IsIn(Object.values(UserRole)) role!: UserRole;
  @IsOptional() @IsString() customerId?: string;
}

export class RefreshDto {
  @IsString() refreshToken!: string;
}

export class CreateCustomerDto {
  @IsString() @MinLength(2) name!: string;
  @IsString() tierId!: string;
  @IsString() @Length(3, 3) currency!: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() ownerUserId?: string;
}

export class UpdateCustomerDto {
  @IsOptional() @IsString() @MinLength(2) name?: string;
  @IsOptional() @IsString() tierId?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() ownerUserId?: string;
}

export class CreateQuoteDto {
  @IsString() customerId!: string;
  @IsString() @Length(3, 3) currency!: string;
}

export class UpdateQuoteDto {
  @IsOptional() @IsString() validUntil?: string;
  @IsOptional() @IsString() ownerUserId?: string;
}

export class CreateLineDto {
  @IsString() productId!: string;
  @IsInt() @Min(1) qty!: number;
  @IsOptional() @IsInt() @Min(0) @Max(10000) discountBps?: number;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsIn(Object.values(LineType)) lineType?: LineType;
}

export class UpdateLineDto {
  @IsOptional() @IsInt() @Min(1) qty?: number;
  @IsOptional() @IsInt() @Min(0) @Max(10000) discountBps?: number;
  @IsOptional() @IsString() description?: string;
}

export class PageDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize?: number;
}

export class ListQuotesDto extends PageDto {
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() customerId?: string;
  @IsOptional() @IsString() ownerUserId?: string;
}

export class ListCustomersDto extends PageDto {
  @IsOptional() @IsString() q?: string;
  @IsOptional() @IsString() tierId?: string;
}

export class ListOrdersDto extends PageDto {
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() customerId?: string;
}
