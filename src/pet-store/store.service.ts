import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseProvider } from './database.provider.js';
import {
  CreateOrderDto,
  InventoryDto,
  OrderDto,
  OrderStatus,
  PetStatus,
} from './dto.js';

type OrderRow = {
  id: number;
  pet_id: number;
  quantity: number;
  ship_date: string | null;
  status: OrderStatus;
  complete: number;
};
@Injectable()
export class StoreService {
  constructor(private readonly database: DatabaseProvider) {}
  inventory(): InventoryDto {
    const inventory = { available: 0, pending: 0, sold: 0 };
    const rows = this.database.db
      .prepare('SELECT status, COUNT(*) AS count FROM pets GROUP BY status')
      .all() as { status: PetStatus; count: number }[];
    for (const row of rows) inventory[row.status] = row.count;
    return inventory;
  }
  create(dto: CreateOrderDto): OrderDto {
    if (
      !this.database.db
        .prepare('SELECT id FROM pets WHERE id = ?')
        .get(dto.petId)
    )
      throw new NotFoundException('Pet not found');
    try {
      const result = this.database.db
        .prepare(
          'INSERT INTO orders (pet_id, quantity, ship_date, status, complete) VALUES (?, ?, ?, ?, ?)',
        )
        .run(
          dto.petId,
          dto.quantity ?? 1,
          dto.shipDate ?? null,
          dto.status ?? OrderStatus.Placed,
          Number(dto.complete ?? false),
        );
      return this.findOne(Number(result.lastInsertRowid));
    } catch (error) {
      if (error instanceof Error && 'errcode' in error && error.errcode === 787)
        throw new ConflictException('Pet relationship conflict');
      throw error;
    }
  }
  findOne(id: number): OrderDto {
    const row = this.database.db
      .prepare('SELECT * FROM orders WHERE id = ?')
      .get(id) as OrderRow | undefined;
    if (!row) throw new NotFoundException('Order not found');
    return {
      id: row.id,
      petId: row.pet_id,
      quantity: row.quantity,
      ...(row.ship_date === null ? {} : { shipDate: row.ship_date }),
      status: row.status,
      complete: Boolean(row.complete),
    };
  }
  delete(id: number): void {
    if (
      !this.database.db.prepare('DELETE FROM orders WHERE id = ?').run(id)
        .changes
    )
      throw new NotFoundException('Order not found');
  }
}
