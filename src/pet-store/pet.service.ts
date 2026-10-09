import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreatePetDto, PetDto, PetStatus, UpdatePetDto } from './pet.dto.js';
import { PetRepository } from './pet.repository.js';
import {
  isSqliteConstraint,
  SQLITE_CONSTRAINT_FOREIGNKEY,
  SQLITE_CONSTRAINT_TRIGGER,
} from './sqlite-errors.js';

function applyPetDefaults(dto: CreatePetDto): Omit<PetDto, 'id'> {
  return {
    name: dto.name,
    photoUrls: dto.photoUrls,
    category: dto.category,
    tags: dto.tags ?? [],
    status: dto.status ?? PetStatus.Available,
  };
}

@Injectable()
export class PetService {
  constructor(private readonly pets: PetRepository) {}

  create(dto: CreatePetDto): PetDto {
    const id = this.pets.create(applyPetDefaults(dto));
    return this.findOne(id);
  }

  findAll(): PetDto[] {
    return this.pets.findAll();
  }

  findOne(id: number): PetDto {
    const pet = this.pets.findOne(id);
    if (!pet) {
      throw new NotFoundException('Pet not found');
    }
    return pet;
  }

  update(dto: UpdatePetDto): PetDto {
    if (!this.pets.update(dto.id, applyPetDefaults(dto))) {
      throw new NotFoundException('Pet not found');
    }
    return this.findOne(dto.id);
  }

  findByStatus(statuses: PetStatus[]): PetDto[] {
    return this.pets.findByStatus(statuses);
  }

  findByTags(tags: string[]): PetDto[] {
    return this.pets.findByTags(tags);
  }

  delete(id: number): void {
    this.findOne(id);
    try {
      this.pets.delete(id);
    } catch (error) {
      if (
        isSqliteConstraint(
          error,
          SQLITE_CONSTRAINT_FOREIGNKEY,
          SQLITE_CONSTRAINT_TRIGGER,
        )
      ) {
        throw new ConflictException('Pet is referenced by an order');
      }
      throw error;
    }
  }
}
