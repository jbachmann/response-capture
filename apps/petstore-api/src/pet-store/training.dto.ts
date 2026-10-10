import type { SeedResult } from '@response-capture/contracts/petstore';
import { ApiProperty } from '@nestjs/swagger';
import { InventoryDto } from './order.dto.js';

export class SeedResultDto implements SeedResult {
  @ApiProperty({ type: 'integer', example: 6 })
  pets: number;

  @ApiProperty({ type: 'integer', example: 3 })
  orders: number;

  @ApiProperty({ type: InventoryDto })
  inventory: InventoryDto;
}
