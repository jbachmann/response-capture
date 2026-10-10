import { DatabaseProvider } from './database.provider.js';
import { PetRepository } from './pet.repository.js';
import { OrderRepository } from './order.repository.js';
import { PetStatus } from './pet.dto.js';
import { OrderStatus } from './order.dto.js';
import { SQLITE_CONSTRAINT_FOREIGNKEY, SQLITE_CONSTRAINT_TRIGGER } from './sqlite-errors.js';

// Exercise the real SQLite schema without HTTP or mocked statements.
describe('Petstore repositories', () => {
  let database: DatabaseProvider;
  let pets: PetRepository;
  let orders: OrderRepository;

  const pet = {
    name: 'Milo',
    photoUrls: ['https://example.com/milo.jpg'],
    category: { id: 1, name: 'Cats' },
    tags: [{ id: 2, name: 'quiet' }],
    status: PetStatus.Pending,
  };

  beforeEach(() => {
    const previousPath = process.env.DATABASE_PATH;
    process.env.DATABASE_PATH = ':memory:';
    try {
      database = new DatabaseProvider();
    } finally {
      if (previousPath === undefined) {
        delete process.env.DATABASE_PATH;
      } else {
        process.env.DATABASE_PATH = previousPath;
      }
    }
    pets = new PetRepository(database);
    orders = new OrderRepository(database);
  });

  afterEach(() => {
    database?.onModuleDestroy();
  });

  it('round-trips nested pet data and removes omitted category on replacement', () => {
    const id = pets.create(pet);
    expect(pets.findOne(id)).toEqual({ ...pet, id });
    expect(
      pets.update(id, {
        name: 'New name',
        photoUrls: [],
        tags: [],
        status: PetStatus.Available,
      }),
    ).toBe(true);
    expect(pets.findOne(id)).toEqual({
      id,
      name: 'New name',
      photoUrls: [],
      tags: [],
      status: PetStatus.Available,
    });
    expect(pets.findOne(id)).not.toHaveProperty('category');
  });

  it('round-trips shipping dates and both completion flags without adding absent fields', () => {
    const petId = pets.create(pet);
    for (const complete of [false, true]) {
      const order = {
        petId,
        quantity: 2,
        status: OrderStatus.Approved,
        complete,
      };
      const id = orders.create(order);
      expect(orders.findOne(id)).toEqual({ ...order, id });
      expect(orders.findOne(id)).not.toHaveProperty('shipDate');
    }
    const order = {
      petId,
      quantity: 1,
      status: OrderStatus.Delivered,
      complete: true,
      shipDate: '2026-10-10T12:00:00Z',
    };
    const id = orders.create(order);
    expect(orders.findOne(id)).toEqual({ ...order, id });
  });

  it('enforces foreign keys even when repositories are called without services', () => {
    const order = {
      petId: 999,
      quantity: 1,
      status: OrderStatus.Placed,
      complete: false,
    };
    expect(() => orders.create(order)).toThrow(
      expect.objectContaining({
        errcode: SQLITE_CONSTRAINT_FOREIGNKEY,
      }),
    );
    const petId = pets.create(pet);
    const orderId = orders.create({ ...order, petId });
    expect(() => pets.delete(petId)).toThrow(
      expect.objectContaining({
        errcode: expect.toBeOneOf([SQLITE_CONSTRAINT_FOREIGNKEY, SQLITE_CONSTRAINT_TRIGGER]),
      }),
    );
    expect(pets.findOne(petId)).toEqual({ ...pet, id: petId });
    expect(orders.delete(orderId)).toBe(true);
    expect(pets.delete(petId)).toBe(true);
  });

  it('enforces quantity, status, and completion constraints below request validation', () => {
    const petId = pets.create(pet);
    const valid = {
      petId,
      quantity: 1,
      status: OrderStatus.Placed,
      complete: false,
    };
    expect(() => orders.create({ ...valid, quantity: 0 })).toThrow();
    expect(() => orders.create({ ...valid, status: 'invalid' as OrderStatus })).toThrow();
    expect(() => orders.create({ ...valid, complete: 2 as unknown as boolean })).toThrow();
    expect(() => pets.create({ ...pet, status: 'invalid' as PetStatus })).toThrow();
    expect(orders.findOne(1)).toBeUndefined();
    expect(pets.findAll()).toHaveLength(1);
  });

  it('rolls back pet and order writes together on the shared connection', () => {
    const petId = pets.create(pet);
    database.db.exec('BEGIN IMMEDIATE');
    pets.update(petId, { ...pet, name: 'Changed' });
    const orderId = orders.create({
      petId,
      quantity: 1,
      status: OrderStatus.Placed,
      complete: false,
    });
    database.db.exec('ROLLBACK');
    expect(pets.findOne(petId)).toEqual({ ...pet, id: petId });
    expect(orders.findOne(orderId)).toBeUndefined();
  });
});
