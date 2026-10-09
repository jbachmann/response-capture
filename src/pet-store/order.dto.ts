import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsISO8601,
  Matches,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';
import { isProvided } from './validation.js';

export enum OrderStatus {
  Placed = 'placed',
  Approved = 'approved',
  Delivered = 'delivered',
}

export class CreateOrderDto {
  @ApiProperty({
    type: 'integer',
    minimum: 1,
    maximum: Number.MAX_SAFE_INTEGER,
  })
  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  petId: number;

  @ApiPropertyOptional({
    type: 'integer',
    default: 1,
    minimum: 1,
    maximum: Number.MAX_SAFE_INTEGER,
  })
  @ValidateIf(isProvided)
  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  quantity?: number;

  @ApiPropertyOptional({ format: 'date-time' })
  @ValidateIf(isProvided)
  @IsISO8601({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}T/)
  shipDate?: string;

  @ApiPropertyOptional({ enum: OrderStatus, default: OrderStatus.Placed })
  @ValidateIf(isProvided)
  @IsEnum(OrderStatus)
  status?: OrderStatus;

  @ApiPropertyOptional({ default: false })
  @ValidateIf(isProvided)
  @IsBoolean()
  complete?: boolean;
}

export class OrderDto {
  @ApiProperty({
    type: 'integer',
    minimum: 1,
    maximum: Number.MAX_SAFE_INTEGER,
  })
  petId: number;

  @ApiProperty({
    type: 'integer',
    default: 1,
    minimum: 1,
    maximum: Number.MAX_SAFE_INTEGER,
  })
  quantity: number;

  @ApiPropertyOptional({ format: 'date-time' })
  shipDate?: string;

  @ApiProperty({ enum: OrderStatus, default: OrderStatus.Placed })
  status: OrderStatus;

  @ApiProperty({ default: false })
  complete: boolean;

  @ApiProperty({
    type: 'integer',
    minimum: 1,
    maximum: Number.MAX_SAFE_INTEGER,
  })
  id: number;
}

export class InventoryDto {
  @ApiProperty({ type: 'integer', minimum: 0 })
  available: number;

  @ApiProperty({ type: 'integer', minimum: 0 })
  pending: number;

  @ApiProperty({ type: 'integer', minimum: 0 })
  sold: number;
}
