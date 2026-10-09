import { Body, Controller, Delete, Get, HttpCode, Post } from '@nestjs/common';
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
import { CreateOrderDto, InventoryDto, OrderDto } from './order.dto.js';
import { IdParam } from './id.pipe.js';
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
  @ApiErrors({ notFound: true, conflict: true })
  create(@Body() dto: CreateOrderDto) {
    return this.store.create(dto);
  }

  @Get('order/:orderId')
  @ApiParam({
    name: 'orderId',
    schema: { type: 'integer', minimum: 1, maximum: Number.MAX_SAFE_INTEGER },
  })
  @ApiOkResponse({ type: OrderDto })
  @ApiErrors({ notFound: true })
  findOne(@IdParam('orderId') id: number) {
    return this.store.findOne(id);
  }

  @Delete('order/:orderId')
  @HttpCode(204)
  @ApiParam({
    name: 'orderId',
    schema: { type: 'integer', minimum: 1, maximum: Number.MAX_SAFE_INTEGER },
  })
  @ApiNoContentResponse({ description: 'Order deleted; pet status unchanged' })
  @ApiErrors({ notFound: true })
  delete(@IdParam('orderId') id: number) {
    this.store.delete(id);
  }
}
