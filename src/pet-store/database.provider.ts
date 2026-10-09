import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

@Injectable()
export class DatabaseProvider implements OnModuleDestroy {
  readonly db: DatabaseSync;

  constructor() {
    const path = process.env.DATABASE_PATH ?? './data/petstore.sqlite';
    if (path !== ':memory:') {
      mkdirSync(dirname(path), { recursive: true });
    }
    this.db = new DatabaseSync(path);
    try {
      this.db.exec(`
        PRAGMA foreign_keys = ON;
        CREATE TABLE IF NOT EXISTS pets (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          photo_urls TEXT NOT NULL,
          category TEXT,
          tags TEXT NOT NULL,
          status TEXT NOT NULL CHECK (status IN ('available', 'pending', 'sold'))
        );
        CREATE TABLE IF NOT EXISTS orders (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          pet_id INTEGER NOT NULL REFERENCES pets(id) ON DELETE RESTRICT,
          quantity INTEGER NOT NULL CHECK (quantity > 0),
          ship_date TEXT,
          status TEXT NOT NULL CHECK (status IN ('placed', 'approved', 'delivered')),
          complete INTEGER NOT NULL CHECK (complete IN (0, 1))
        );
        CREATE INDEX IF NOT EXISTS orders_pet_id ON orders(pet_id);
      `);
    } catch (error) {
      this.db.close();
      throw error;
    }
  }

  onModuleDestroy() {
    this.db.close();
  }
}
