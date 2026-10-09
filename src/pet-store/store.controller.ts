import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
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
import { CreateOrderDto, InventoryDto, OrderDto } from './dto.js';
import { IdPipe } from './id.pipe.js';
import { StoreService } from './store.service.js';

@ApiTags('store')
@Controller('store')
export class StoreController {
  constructor(private readonly store: StoreService) {}

  @Get('inventory')
  @ApiOperation({ summary: 'Count pets by status, including zero counts' })
  @ApiOkResponse({ type: InventoryDto })
  inventory() {
    return this.store.inventory();
  }

  @Post('order')
  @ApiOperation({
    summary: 'Order an existing pet without changing its status',
  })
  @ApiBody({ type: CreateOrderDto })
  @ApiCreatedResponse({ type: OrderDto })
  @ApiErrors(true, true)
  create(@Body() dto: CreateOrderDto) {
    return this.store.create(dto);
  }

  @Get('order/:orderId')
  @ApiParam({
    name: 'orderId',
    schema: { type: 'integer', minimum: 1, maximum: Number.MAX_SAFE_INTEGER },
  })
  @ApiOkResponse({ type: OrderDto })
  @ApiErrors(true)
  findOne(@Param('orderId', IdPipe) id: string) {
    return this.store.findOne(Number(id));
  }

  @Delete('order/:orderId')
  @HttpCode(204)
  @ApiParam({
    name: 'orderId',
    schema: { type: 'integer', minimum: 1, maximum: Number.MAX_SAFE_INTEGER },
  })
  @ApiNoContentResponse({ description: 'Order deleted; pet status unchanged' })
  @ApiErrors(true)
  delete(@Param('orderId', IdPipe) id: string) {
    this.store.delete(Number(id));
  }
}
