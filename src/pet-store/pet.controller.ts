import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  ApiBody,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { ApiErrors } from './api-errors.js';
import {
  CreatePetDto,
  PetDto,
  StatusQueryDto,
  TagsQueryDto,
  UpdatePetDto,
} from './pet.dto.js';
import { IdParam } from './id.pipe.js';
import { PetService } from './pet.service.js';

@ApiTags('pet')
@Controller('pet')
export class PetController {
  constructor(private readonly pets: PetService) {}

  @Post()
  @ApiOperation({ summary: 'Create a pet with a generated ID' })
  @ApiBody({ type: CreatePetDto })
  @ApiCreatedResponse({ type: PetDto })
  @ApiErrors()
  create(@Body() dto: CreatePetDto) {
    return this.pets.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List all pets in ID order' })
  @ApiOkResponse({ type: [PetDto] })
  findAll() {
    return this.pets.findAll();
  }

  @Put()
  @ApiOperation({
    summary:
      'Replace an existing pet; omitted optional fields reset to defaults',
  })
  @ApiBody({ type: UpdatePetDto })
  @ApiOkResponse({ type: PetDto })
  @ApiErrors({ notFound: true })
  update(@Body() dto: UpdatePetDto) {
    return this.pets.update(dto);
  }

  @Get('findByStatus')
  @ApiOperation({
    summary: 'Match any repeated or comma-separated status value',
  })
  @ApiOkResponse({ type: [PetDto] })
  @ApiErrors()
  findByStatus(@Query() query: StatusQueryDto) {
    return this.pets.findByStatus(query.status);
  }

  @Get('findByTags')
  @ApiOperation({ summary: 'Match any repeated or comma-separated tag name' })
  @ApiOkResponse({ type: [PetDto] })
  @ApiErrors()
  findByTags(@Query() query: TagsQueryDto) {
    return this.pets.findByTags(query.tags);
  }

  @Get(':petId')
  @ApiParam({
    name: 'petId',
    schema: { type: 'integer', minimum: 1, maximum: Number.MAX_SAFE_INTEGER },
  })
  @ApiOkResponse({ type: PetDto })
  @ApiErrors({ notFound: true })
  findOne(@IdParam('petId') id: number) {
    return this.pets.findOne(id);
  }

  @Delete(':petId')
  @HttpCode(204)
  @ApiParam({
    name: 'petId',
    schema: { type: 'integer', minimum: 1, maximum: Number.MAX_SAFE_INTEGER },
  })
  @ApiNoContentResponse({ description: 'Pet deleted' })
  @ApiErrors({ notFound: true, conflict: true })
  delete(@IdParam('petId') id: number) {
    this.pets.delete(id);
  }
}
