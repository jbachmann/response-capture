import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CreateOrderDto,
  InventoryDto,
  OrderDto,
  OrderStatus,
} from './order.dto.js';
import { OrderRepository } from './order.repository.js';
import { PetRepository } from './pet.repository.js';
import {
  isSqliteConstraint,
  SQLITE_CONSTRAINT_FOREIGNKEY,
} from './sqlite-errors.js';

@Injectable()
export class StoreService {
  constructor(
    private readonly orders: OrderRepository,
    private readonly pets: PetRepository,
  ) {}

  inventory(): InventoryDto {
    return this.pets.inventory();
  }

  create(dto: CreateOrderDto): OrderDto {
    if (!this.pets.exists(dto.petId)) {
      throw new NotFoundException('Pet not found');
    }
    try {
      const id = this.orders.create({
        petId: dto.petId,
        quantity: dto.quantity ?? 1,
        shipDate: dto.shipDate,
        status: dto.status ?? OrderStatus.Placed,
        complete: dto.complete ?? false,
      });
      return this.findOne(id);
    } catch (error) {
      if (isSqliteConstraint(error, SQLITE_CONSTRAINT_FOREIGNKEY)) {
        throw new ConflictException('Pet relationship conflict');
      }
      throw error;
    }
  }

  findOne(id: number): OrderDto {
    const order = this.orders.findOne(id);
    if (!order) {
      throw new NotFoundException('Order not found');
    }
    return order;
  }

  delete(id: number): void {
    if (!this.orders.delete(id)) {
      throw new NotFoundException('Order not found');
    }
  }
}
