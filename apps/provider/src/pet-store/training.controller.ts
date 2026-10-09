import { Controller, Delete, HttpCode, Post } from '@nestjs/common';
import {
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { SeedResultDto } from './training.dto.js';
import { TrainingService } from './training.service.js';

@ApiTags('training')
@Controller('training')
export class TrainingController {
  constructor(private readonly training: TrainingService) {}

  @Post('seed')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Replace the database with static training data',
    description:
      'Deletes all existing orders and pets, resets their IDs, and inserts six pets and three orders in one transaction. Inventory is calculated from the seeded pets.',
  })
  @ApiOkResponse({ type: SeedResultDto })
  seed(): SeedResultDto {
    return this.training.seed();
  }

  @Delete('database')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Clear the training database',
    description:
      'Deletes all orders and pets and resets their IDs. Leaves the tables ready for reuse.',
  })
  @ApiNoContentResponse({ description: 'Database cleared' })
  clear(): void {
    this.training.clear();
  }
}
