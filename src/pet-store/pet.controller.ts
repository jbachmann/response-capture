import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
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
} from './dto.js';
import { IdPipe } from './id.pipe.js';
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
  @ApiErrors(true)
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
  @ApiErrors(true)
  findOne(@Param('petId', IdPipe) id: string) {
    return this.pets.findOne(Number(id));
  }

  @Delete(':petId')
  @HttpCode(204)
  @ApiParam({
    name: 'petId',
    schema: { type: 'integer', minimum: 1, maximum: Number.MAX_SAFE_INTEGER },
  })
  @ApiNoContentResponse({ description: 'Pet deleted' })
  @ApiErrors(true, true)
  delete(@Param('petId', IdPipe) id: string) {
    this.pets.delete(Number(id));
  }
}
