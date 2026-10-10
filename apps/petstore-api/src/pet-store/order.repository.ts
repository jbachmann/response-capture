import { Injectable } from '@nestjs/common';
import { DatabaseProvider } from './database.provider.js';
import { OrderDto, OrderStatus } from './order.dto.js';

type OrderRow = {
  id: number;
  pet_id: number;
  quantity: number;
  ship_date: string | null;
  status: OrderStatus;
  complete: number;
};

type OrderInput = Omit<OrderDto, 'id'>;

function orderFromRow(row: OrderRow): OrderDto {
  return {
    id: row.id,
    petId: row.pet_id,
    quantity: row.quantity,
    ...(row.ship_date === null ? {} : { shipDate: row.ship_date }),
    status: row.status,
    complete: Boolean(row.complete),
  };
}

@Injectable()
export class OrderRepository {
  constructor(private readonly database: DatabaseProvider) {}

  create(order: OrderInput): number {
    const result = this.database.db
      .prepare(
        `
        INSERT INTO orders (pet_id, quantity, ship_date, status, complete)
        VALUES (?, ?, ?, ?, ?)
      `,
      )
      .run(
        order.petId,
        order.quantity,
        order.shipDate ?? null,
        order.status,
        Number(order.complete),
      );
    return Number(result.lastInsertRowid);
  }

  findAll(): OrderDto[] {
    const rows = this.database.db
      .prepare('SELECT * FROM orders ORDER BY id DESC')
      .all() as OrderRow[];
    return rows.map(orderFromRow);
  }

  findOne(id: number): OrderDto | undefined {
    const row = this.database.db.prepare('SELECT * FROM orders WHERE id = ?').get(id) as
      OrderRow | undefined;
    return row ? orderFromRow(row) : undefined;
  }

  delete(id: number): boolean {
    return Boolean(this.database.db.prepare('DELETE FROM orders WHERE id = ?').run(id).changes);
  }
}
