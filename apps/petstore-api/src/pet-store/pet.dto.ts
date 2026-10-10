import type { Pet, NamedEntity } from '@response-capture/contracts/petstore';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsEnum,
  IsInt,
  IsObject,
  IsString,
  Matches,
  Max,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { isProvided } from './validation.js';

export enum PetStatus {
  Available = 'available',
  Pending = 'pending',
  Sold = 'sold',
}

export class CategoryDto implements NamedEntity {
  @ApiPropertyOptional({
    type: 'integer',
    minimum: 1,
    maximum: Number.MAX_SAFE_INTEGER,
  })
  @ValidateIf(isProvided)
  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  id?: number;

  @ApiPropertyOptional()
  @ValidateIf(isProvided)
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
  @ValidateIf(isProvided)
  @IsObject()
  @ValidateNested()
  @Type(() => CategoryDto)
  category?: CategoryDto;

  @ApiPropertyOptional({ type: [TagDto], default: [] })
  @ValidateIf(isProvided)
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TagDto)
  tags?: TagDto[];

  @ApiPropertyOptional({ enum: PetStatus, default: PetStatus.Available })
  @ValidateIf(isProvided)
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

export class PetDto implements Pet {
  @ApiProperty()
  name: string;

  @ApiProperty({ type: [String] })
  photoUrls: string[];

  @ApiPropertyOptional({ type: CategoryDto })
  category?: CategoryDto;

  @ApiProperty({ type: [TagDto], default: [] })
  tags: TagDto[];

  @ApiProperty({ enum: PetStatus, default: PetStatus.Available })
  status: PetStatus;

  @ApiProperty({
    type: 'integer',
    minimum: 1,
    maximum: Number.MAX_SAFE_INTEGER,
  })
  id: number;
}

const splitQueryValues = ({ value }: { value: unknown }) => {
  if (typeof value === 'string') {
    return value.split(',').map((v) => v.trim());
  }
  if (Array.isArray(value) && value.every((v) => typeof v === 'string')) {
    return value.flatMap((v: string) => v.split(',').map((s) => s.trim()));
  }
  return value;
};

export class StatusQueryDto {
  @ApiProperty({ enum: PetStatus, isArray: true })
  @Transform(splitQueryValues)
  @IsArray()
  @ArrayNotEmpty()
  @IsEnum(PetStatus, { each: true })
  status: PetStatus[];
}

export class TagsQueryDto {
  @ApiProperty({ type: [String] })
  @Transform(splitQueryValues)
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  @Matches(/\S/, { each: true })
  tags: string[];
}
