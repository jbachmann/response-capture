import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  Put,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CatalogRepository } from './catalog.repository.js';
import { validateSubmission } from './catalog-submission.js';
import type { StoredCatalogSubmission } from './catalog-submission.js';

@Controller()
@ApiTags('Catalogs')
export class CatalogController {
  constructor(
    @Inject(CatalogRepository) private readonly catalogs: CatalogRepository,
  ) {}

  @Get('catalog-submission')
  @ApiOperation({
    summary: 'List catalog submissions',
    description:
      'Returns all stored submissions, newest first. Timestamp ties are resolved by submission sequence. An empty database returns an empty array.',
  })
  @ApiOkResponse({
    description:
      'Stored submissions with catalog payloads and submission timestamps.',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        required: ['systemName', 'commitHash', 'catalog', 'submittedAt'],
        properties: {
          systemName: { type: 'string', example: 'provider' },
          commitHash: { type: 'string', example: 'example-commit' },
          alias: { type: 'string', example: 'main' },
          catalog: { type: 'object', additionalProperties: true },
          submittedAt: { type: 'string', format: 'date-time' },
        },
      },
    },
  })
  list(): StoredCatalogSubmission[] {
    return this.catalogs.list();
  }

  @Put('catalog-submissions')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Submit or replace a catalog',
    description:
      'The system/commit pair is unique. Replacing a submission refreshes its timestamp and clears the alias when omitted. JSON bodies are limited to 10 MiB.',
  })
  @ApiBody({
    required: true,
    schema: {
      type: 'object',
      required: ['systemName', 'commitHash', 'catalog'],
      properties: {
        systemName: { type: 'string', pattern: '\\S', example: 'provider' },
        commitHash: {
          type: 'string',
          pattern: '\\S',
          example: 'example-commit',
        },
        alias: { type: 'string', example: 'main' },
        catalog: {
          type: 'object',
          additionalProperties: true,
          example: { catalogVersion: 1, scenarios: [] },
        },
      },
    },
  })
  @ApiNoContentResponse({ description: 'Catalog stored successfully.' })
  @ApiBadRequestResponse({ description: 'Invalid submission.' })
  @ApiResponse({ status: 413, description: 'Request body exceeds 10 MiB.' })
  submit(@Body() submission: unknown): void {
    validateSubmission(submission);
    this.catalogs.submit(submission);
  }

  @Get('catalogs/:systemName')
  @ApiOperation({ summary: 'Retrieve the latest catalog for a system' })
  @ApiParam({ name: 'systemName', type: String, example: 'provider' })
  @ApiOkResponse({
    description: 'The submitted catalog object.',
    schema: { type: 'object', additionalProperties: true },
  })
  @ApiNotFoundResponse({ description: 'No matching catalog submission.' })
  latest(@Param('systemName') systemName: string): Record<string, unknown> {
    return this.find(systemName);
  }

  @Get('catalogs/:systemName/:selector')
  @ApiOperation({
    summary: 'Retrieve a catalog by alias or commit hash',
    description:
      'Matches are exact and case-sensitive. The newest matching submission wins, including when an alias collides with a commit hash. URL-encode path segments containing slashes.',
  })
  @ApiParam({ name: 'systemName', type: String, example: 'provider' })
  @ApiParam({
    name: 'selector',
    type: String,
    description: 'Alias or commit hash.',
    example: 'main',
  })
  @ApiOkResponse({
    description: 'The submitted catalog object.',
    schema: { type: 'object', additionalProperties: true },
  })
  @ApiNotFoundResponse({ description: 'No matching catalog submission.' })
  selected(
    @Param('systemName') systemName: string,
    @Param('selector') selector: string,
  ): Record<string, unknown> {
    return this.find(systemName, selector);
  }

  private find(systemName: string, selector?: string): Record<string, unknown> {
    const catalog = this.catalogs.latest(systemName, selector);
    if (catalog === undefined)
      throw new NotFoundException('No matching catalog submission');
    return catalog;
  }
}
