import { Injectable } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import { DatabaseProvider } from './database.provider.js';
import { InventoryDto } from './dto.js';
import { PetService } from './pet.service.js';
import { seedOrders, seedPets } from './seed-data.js';
import { StoreService } from './store.service.js';

export class SeedResultDto {
  @ApiProperty({ type: 'integer', example: 6 }) pets: number;
  @ApiProperty({ type: 'integer', example: 3 }) orders: number;
  @ApiProperty({ type: InventoryDto }) inventory: InventoryDto;
}

@Injectable()
export class TrainingService {
  constructor(
    private readonly database: DatabaseProvider,
    private readonly pets: PetService,
    private readonly store: StoreService,
  ) {}

  seed(): SeedResultDto {
    return this.reset(() => {
      const pets = seedPets.map((pet) => this.pets.create(pet));
      for (const { petIndex, ...order } of seedOrders) {
        this.store.create({ ...order, petId: pets[petIndex].id });
      }
      return {
        pets: pets.length,
        orders: seedOrders.length,
        inventory: this.store.inventory(),
      };
    });
  }

  clear(): void {
    this.reset(() => undefined);
  }

  private reset<T>(populate: () => T): T {
    const db = this.database.db;
    db.exec('BEGIN IMMEDIATE');
    try {
      // Delete referencing orders first while keeping foreign keys enabled.
      db.prepare('DELETE FROM orders').run();
      db.prepare('DELETE FROM pets').run();
      db.prepare('DELETE FROM sqlite_sequence WHERE name IN (?, ?)').run(
        'pets',
        'orders',
      );
      const result = populate();
      db.exec('COMMIT');
      return result;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
}
