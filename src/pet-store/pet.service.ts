import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseProvider } from './database.provider.js';
import { CreatePetDto, PetDto, PetStatus, UpdatePetDto } from './dto.js';

type PetRow = {
  id: number;
  name: string;
  photo_urls: string;
  category: string | null;
  tags: string;
  status: PetStatus;
};
const petFromRow = (row: PetRow): PetDto => ({
  id: row.id,
  name: row.name,
  photoUrls: JSON.parse(row.photo_urls),
  ...(row.category === null ? {} : { category: JSON.parse(row.category) }),
  tags: JSON.parse(row.tags),
  status: row.status,
});
@Injectable()
export class PetService {
  constructor(private readonly database: DatabaseProvider) {}
  create(dto: CreatePetDto): PetDto {
    const result = this.database.db
      .prepare(
        'INSERT INTO pets (name, photo_urls, category, tags, status) VALUES (?, ?, ?, ?, ?)',
      )
      .run(...this.values(dto));
    return this.findOne(Number(result.lastInsertRowid));
  }
  private values(dto: CreatePetDto) {
    return [
      dto.name,
      JSON.stringify(dto.photoUrls),
      dto.category === undefined ? null : JSON.stringify(dto.category),
      JSON.stringify(dto.tags ?? []),
      dto.status ?? PetStatus.Available,
    ];
  }
  findAll(): PetDto[] {
    return (
      this.database.db
        .prepare('SELECT * FROM pets ORDER BY id')
        .all() as PetRow[]
    ).map(petFromRow);
  }
  findOne(id: number): PetDto {
    const row = this.database.db
      .prepare('SELECT * FROM pets WHERE id = ?')
      .get(id) as PetRow | undefined;
    if (!row) throw new NotFoundException('Pet not found');
    return petFromRow(row);
  }
  update(dto: UpdatePetDto): PetDto {
    const result = this.database.db
      .prepare(
        'UPDATE pets SET name = ?, photo_urls = ?, category = ?, tags = ?, status = ? WHERE id = ?',
      )
      .run(...this.values(dto), dto.id);
    if (!result.changes) throw new NotFoundException('Pet not found');
    return this.findOne(dto.id);
  }
  findByStatus(status: PetStatus[]): PetDto[] {
    const placeholders = status.map(() => '?').join(',');
    return (
      this.database.db
        .prepare(
          `SELECT * FROM pets WHERE status IN (${placeholders}) ORDER BY id`,
        )
        .all(...status) as PetRow[]
    ).map(petFromRow);
  }
  findByTags(tags: string[]): PetDto[] {
    const placeholders = tags.map(() => '?').join(',');
    return (
      this.database.db
        .prepare(
          `SELECT * FROM pets WHERE EXISTS (SELECT 1 FROM json_each(pets.tags) AS tag WHERE json_extract(tag.value, '$.name') IN (${placeholders})) ORDER BY id`,
        )
        .all(...tags) as PetRow[]
    ).map(petFromRow);
  }
  delete(id: number): void {
    this.findOne(id);
    try {
      this.database.db.prepare('DELETE FROM pets WHERE id = ?').run(id);
    } catch (error) {
      if (
        error instanceof Error &&
        'errcode' in error &&
        (error.errcode === 787 || error.errcode === 1811)
      )
        throw new ConflictException('Pet is referenced by an order');
      throw error;
    }
  }
}
