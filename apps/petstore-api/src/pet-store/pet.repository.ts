import { Injectable } from '@nestjs/common';
import { DatabaseProvider } from './database.provider.js';
import { PetDto, PetStatus } from './pet.dto.js';
import { InventoryDto } from './order.dto.js';

type PetRow = {
  id: number;
  name: string;
  photo_urls: string;
  category: string | null;
  tags: string;
  status: PetStatus;
};

type PetInput = Omit<PetDto, 'id'>;

function petFromRow(row: PetRow): PetDto {
  return {
    id: row.id,
    name: row.name,
    photoUrls: JSON.parse(row.photo_urls),
    ...(row.category === null ? {} : { category: JSON.parse(row.category) }),
    tags: JSON.parse(row.tags),
    status: row.status,
  };
}

function serializePet(pet: PetInput) {
  return [
    pet.name,
    JSON.stringify(pet.photoUrls),
    pet.category === undefined ? null : JSON.stringify(pet.category),
    JSON.stringify(pet.tags),
    pet.status,
  ];
}

@Injectable()
export class PetRepository {
  constructor(private readonly database: DatabaseProvider) {}

  create(pet: PetInput): number {
    const result = this.database.db
      .prepare(
        `
        INSERT INTO pets (name, photo_urls, category, tags, status)
        VALUES (?, ?, ?, ?, ?)
      `,
      )
      .run(...serializePet(pet));
    return Number(result.lastInsertRowid);
  }

  findAll(): PetDto[] {
    const rows = this.database.db.prepare('SELECT * FROM pets ORDER BY id').all() as PetRow[];
    return rows.map(petFromRow);
  }

  exists(id: number): boolean {
    return Boolean(this.database.db.prepare('SELECT id FROM pets WHERE id = ?').get(id));
  }

  findOne(id: number): PetDto | undefined {
    const row = this.database.db.prepare('SELECT * FROM pets WHERE id = ?').get(id) as
      PetRow | undefined;
    return row ? petFromRow(row) : undefined;
  }

  update(id: number, pet: PetInput): boolean {
    const result = this.database.db
      .prepare(
        `
        UPDATE pets
        SET name = ?, photo_urls = ?, category = ?, tags = ?, status = ?
        WHERE id = ?
      `,
      )
      .run(...serializePet(pet), id);
    return Boolean(result.changes);
  }

  findByStatus(statuses: PetStatus[]): PetDto[] {
    const placeholders = statuses.map(() => '?').join(',');
    const rows = this.database.db
      .prepare(`SELECT * FROM pets WHERE status IN (${placeholders}) ORDER BY id`)
      .all(...statuses) as PetRow[];
    return rows.map(petFromRow);
  }

  findByTags(tags: string[]): PetDto[] {
    const placeholders = tags.map(() => '?').join(',');
    const rows = this.database.db
      .prepare(
        `
        SELECT * FROM pets
        WHERE EXISTS (
          SELECT 1 FROM json_each(pets.tags) AS tag
          WHERE json_extract(tag.value, '$.name') IN (${placeholders})
        )
        ORDER BY id
      `,
      )
      .all(...tags) as PetRow[];
    return rows.map(petFromRow);
  }

  inventory(): InventoryDto {
    const inventory = { available: 0, pending: 0, sold: 0 };
    const rows = this.database.db
      .prepare('SELECT status, COUNT(*) AS count FROM pets GROUP BY status')
      .all() as { status: PetStatus; count: number }[];
    for (const row of rows) {
      inventory[row.status] = row.count;
    }
    return inventory;
  }

  delete(id: number): boolean {
    return Boolean(this.database.db.prepare('DELETE FROM pets WHERE id = ?').run(id).changes);
  }
}
