import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsISO8601,
  IsObject,
  IsString,
  Matches,
  Max,
  Min,
  ValidateIf,
  ValidateNested,
  ArrayNotEmpty,
} from 'class-validator';

export enum PetStatus {
  Available = 'available',
  Pending = 'pending',
  Sold = 'sold',
}
export enum OrderStatus {
  Placed = 'placed',
  Approved = 'approved',
  Delivered = 'delivered',
}
const optional = (_: unknown, value: unknown) => value !== undefined;

export class CategoryDto {
  @ApiPropertyOptional({
    type: 'integer',
    minimum: 1,
    maximum: Number.MAX_SAFE_INTEGER,
  })
  @ValidateIf(optional)
  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  id?: number;

  @ApiPropertyOptional()
  @ValidateIf(optional)
  @IsString()
  @Matches(/\S/)
  name?: string;
}
export class TagDto extends CategoryDto {}

export class CreatePetDto {
  @ApiProperty()
  @IsString()
  @Matches(/\S/)
  name: string;

  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  photoUrls: string[];

  @ApiPropertyOptional({ type: CategoryDto })
  @ValidateIf(optional)
  @IsObject()
  @ValidateNested()
  @Type(() => CategoryDto)
  category?: CategoryDto;

  @ApiPropertyOptional({ type: [TagDto], default: [] })
  @ValidateIf(optional)
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TagDto)
  tags?: TagDto[];

  @ApiPropertyOptional({ enum: PetStatus, default: PetStatus.Available })
  @ValidateIf(optional)
  @IsEnum(PetStatus)
  status?: PetStatus;
}
export class UpdatePetDto extends CreatePetDto {
  @ApiProperty({
    type: 'integer',
    minimum: 1,
    maximum: Number.MAX_SAFE_INTEGER,
  })
  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  id: number;
}
export class PetDto extends UpdatePetDto {
  @ApiProperty({ type: [TagDto], required: true })
  declare tags: TagDto[];
  @ApiProperty({ enum: PetStatus, required: true })
  declare status: PetStatus;
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
  @ValidateIf(optional)
  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  quantity?: number;

  @ApiPropertyOptional({ format: 'date-time' })
  @ValidateIf(optional)
  @IsISO8601({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}T/)
  shipDate?: string;

  @ApiPropertyOptional({ enum: OrderStatus, default: OrderStatus.Placed })
  @ValidateIf(optional)
  @IsEnum(OrderStatus)
  status?: OrderStatus;

  @ApiPropertyOptional({ default: false })
  @ValidateIf(optional)
  @IsBoolean()
  complete?: boolean;
}
export class OrderDto extends CreateOrderDto {
  @ApiProperty({
    type: 'integer',
    minimum: 1,
    maximum: Number.MAX_SAFE_INTEGER,
  })
  id: number;
  @ApiProperty({
    type: 'integer',
    minimum: 1,
    maximum: Number.MAX_SAFE_INTEGER,
    required: true,
  })
  declare quantity: number;
  @ApiProperty({ enum: OrderStatus, required: true })
  declare status: OrderStatus;
  @ApiProperty({ required: true }) declare complete: boolean;
}
export class InventoryDto {
  @ApiProperty({ type: 'integer', minimum: 0 }) available: number;
  @ApiProperty({ type: 'integer', minimum: 0 }) pending: number;
  @ApiProperty({ type: 'integer', minimum: 0 }) sold: number;
}
const queryValues = ({ value }: { value: unknown }) => {
  if (typeof value === 'string') return value.split(',').map((v) => v.trim());
  if (Array.isArray(value) && value.every((v) => typeof v === 'string'))
    return value.flatMap((v: string) => v.split(',').map((s) => s.trim()));
  return value;
};
export class StatusQueryDto {
  @ApiProperty({ enum: PetStatus, isArray: true })
  @Transform(queryValues)
  @IsArray()
  @ArrayNotEmpty()
  @IsEnum(PetStatus, { each: true })
  status: PetStatus[];
}
export class TagsQueryDto {
  @ApiProperty({ type: [String] })
  @Transform(queryValues)
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  @Matches(/\S/, { each: true })
  tags: string[];
}
