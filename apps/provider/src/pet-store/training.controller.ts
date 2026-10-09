import {
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Post,
} from '@nestjs/common';
import {
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { readFile } from 'node:fs/promises';
import { SeedResultDto } from './training.dto.js';
import { TrainingService } from './training.service.js';

@ApiTags('training')
@Controller('training')
export class TrainingController {
  constructor(private readonly training: TrainingService) {}

  @Get('catalog')
  @ApiOperation({ summary: 'Read the generated API scenario catalog' })
  @ApiOkResponse({
    description: 'Contents of artifacts/api-scenarios/catalog.json',
    schema: { type: 'object', additionalProperties: true },
  })
  @ApiNotFoundResponse({ description: 'The catalog has not been generated' })
  async catalog(): Promise<unknown> {
    let content: string;
    try {
      content = await readFile('artifacts/api-scenarios/catalog.json', 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new NotFoundException(
          'The API scenario catalog has not been generated',
        );
      }
      throw error;
    }
    return JSON.parse(content) as unknown;
  }

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
