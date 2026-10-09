import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { setupApp } from '../src/setup-app.js';
import { DatabaseProvider } from '../src/pet-store/database.provider.js';
import { createScenarioRecorder } from './support/api-scenario-recorder/index.js';
import { TrainingService } from '../src/pet-store/training.service.js';

describe('SQLite Petstore (e2e)', () => {
  let app: INestApplication;
  let directory: string;
  let previousPath: string | undefined;
  const pet = { name: 'Milo', photoUrls: ['https://example.com/milo.jpg'] };
  const api = () => request(app.getHttpServer());
  async function open() {
    const fixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = fixture.createNestApplication();
    setupApp(app);
    await app.init();
  }
  beforeEach(async () => {
    directory = mkdtempSync(join(tmpdir(), 'petstore-'));
    previousPath = process.env.DATABASE_PATH;
    process.env.DATABASE_PATH = join(directory, 'nested', 'test.sqlite');
    await open();
  });
  afterEach(async () => {
    await app?.close();
    if (previousPath === undefined) delete process.env.DATABASE_PATH;
    else process.env.DATABASE_PATH = previousPath;
    rmSync(directory, { recursive: true, force: true });
  });

  it('records asserted Petstore success and error examples', async () => {
    const recorder = createScenarioRecorder({
      app: app.getHttpServer(),
      suiteId: 'petstore-examples',
      outputDirectory: 'artifacts/api-scenarios',
    });
    await recorder.recordScenario(
      'pet.create.success',
      { method: 'POST', path: '/pet', body: pet },
      (test) =>
        test
          .expect(201)
          .expect({ ...pet, id: 1, tags: [], status: 'available' }),
      {
        description: 'Creates a pet from a synthetic fixture',
        requestMatch: { bodyContains: { name: 'Milo' } },
      },
    );
    await recorder.recordScenario(
      'pet.create.invalid',
      { method: 'POST', path: '/pet', body: {} },
      (test) => test.expect(400),
    );
    await recorder.recordScenario(
      'pet.read.missing',
      { method: 'GET', path: '/pet/999' },
      (test) => test.expect(404),
    );
    await recorder.recordScenario(
      'pet.list.success',
      { method: 'GET', path: '/pet' },
      async (test) => {
        const response = await test.expect(200);
        expect(response.body).toEqual([
          { ...pet, id: 1, tags: [], status: 'available' },
        ]);
        return response;
      },
    );
    await recorder.recordScenario(
      'pet.delete.success',
      { method: 'DELETE', path: '/pet/1' },
      (test) => test.expect(204),
    );
    await recorder.flush();
  });

  it('preserves root and starts empty', async () => {
    await api().get('/').expect(200).expect('Hello World!');
    await api().get('/pet').expect(200).expect([]);
    await api()
      .get('/store/inventory')
      .expect(200)
      .expect({ available: 0, pending: 0, sold: 0 });
  });
  it('creates, lists, reads, replaces, and deletes pets', async () => {
    const created = (
      await api()
        .post('/pet')
        .send({
          ...pet,
          category: { id: 1, name: 'Cat' },
          tags: [{ id: 2, name: 'cute' }],
          status: 'sold',
        })
        .expect(201)
    ).body;
    expect(created).toMatchObject({ ...pet, id: 1, status: 'sold' });
    await api().get('/pet/1').expect(200).expect(created);
    await api().get('/pet').expect(200).expect([created]);
    const replaced = { id: 1, name: 'New name', photoUrls: [] };
    await api()
      .put('/pet')
      .send(replaced)
      .expect(200)
      .expect({ ...replaced, tags: [], status: 'available' });
    const deleted = await api().delete('/pet/1').expect(204);
    expect(deleted.text).toBe('');
    await api().get('/pet/1').expect(404);
    await api().delete('/pet/1').expect(404);
    await api()
      .put('/pet')
      .send({ ...pet, id: 1 })
      .expect(404);
  });
  it('filters by any status or tag with repeated and comma-separated values in ID order', async () => {
    await api()
      .post('/pet')
      .send({ ...pet, tags: [{ name: 'cute' }, { name: 'small' }] })
      .expect(201);
    await api()
      .post('/pet')
      .send({ ...pet, status: 'pending', tags: [{ name: 'big' }] })
      .expect(201);
    await api()
      .post('/pet')
      .send({
        ...pet,
        status: 'sold',
        tags: [{ name: "x'); DROP TABLE pets;--" }],
      })
      .expect(201);
    for (const query of [
      'status=pending,available',
      'status=pending&status=available',
      'status=pending,available&status=available',
    ]) {
      expect(
        (await api().get(`/pet/findByStatus?${query}`).expect(200)).body.map(
          (p: { id: number }) => p.id,
        ),
      ).toEqual([1, 2]);
    }
    for (const query of [
      'tags=big,cute',
      'tags=big&tags=cute',
      'tags=big,cute&tags=small',
    ]) {
      expect(
        (await api().get(`/pet/findByTags?${query}`).expect(200)).body.map(
          (p: { id: number }) => p.id,
        ),
      ).toEqual([1, 2]);
    }
    await api()
      .get('/pet/findByTags')
      .query({ tags: "x'); DROP TABLE pets;--" })
      .expect(200)
      .then((response) => expect(response.body).toHaveLength(1));
    await api().get('/pet/findByTags?tags=unknown').expect(200).expect([]);
    await api()
      .get('/store/inventory')
      .expect(200)
      .expect({ available: 1, pending: 1, sold: 1 });
  });
  it('creates and deletes orders, protects pets, and leaves pet status unchanged', async () => {
    await api().post('/store/order').send({ petId: 99 }).expect(404);
    await api().post('/pet').send(pet).expect(201);
    const order = (
      await api().post('/store/order').send({ petId: 1 }).expect(201)
    ).body;
    expect(order).toEqual({
      id: 1,
      petId: 1,
      quantity: 1,
      status: 'placed',
      complete: false,
    });
    await api().get('/store/order/1').expect(200).expect(order);
    await api().delete('/pet/1').expect(409);
    await api()
      .get('/pet/1')
      .expect(200)
      .then((r) => expect(r.body.status).toBe('available'));
    await api()
      .get('/store/inventory')
      .expect(200)
      .expect({ available: 1, pending: 0, sold: 0 });
    await api()
      .delete('/store/order/1')
      .expect(204)
      .then((r) => expect(r.text).toBe(''));
    await api().get('/store/order/1').expect(404);
    await api().delete('/store/order/1').expect(404);
    await api()
      .get('/pet/1')
      .expect(200)
      .then((r) => expect(r.body.status).toBe('available'));
    await api().delete('/pet/1').expect(204);
  });
  it('persists nested pet and order records after shutdown and reopening', async () => {
    const savedPet = (
      await api()
        .post('/pet')
        .send({
          ...pet,
          category: { id: 4, name: 'Cats' },
          tags: [{ id: 3, name: 'cute' }],
          status: 'pending',
        })
        .expect(201)
    ).body;
    const savedOrder = (
      await api()
        .post('/store/order')
        .send({
          petId: savedPet.id,
          quantity: 2,
          shipDate: '2026-10-10T12:00:00Z',
          status: 'approved',
          complete: true,
        })
        .expect(201)
    ).body;
    await app.close();
    await open();
    await api().get(`/pet/${savedPet.id}`).expect(200).expect(savedPet);
    await api()
      .get(`/store/order/${savedOrder.id}`)
      .expect(200)
      .expect(savedOrder);
    await api().delete(`/pet/${savedPet.id}`).expect(409);
    const next = (await api().post('/pet').send(pet).expect(201)).body;
    expect(next.id).toBeGreaterThan(savedPet.id);
  });
  it('replaces existing data with repeatable static training data', async () => {
    const existing = (await api().post('/pet').send(pet).expect(201)).body;
    await api().post('/store/order').send({ petId: existing.id }).expect(201);
    const summary = {
      pets: 6,
      orders: 3,
      inventory: { available: 2, pending: 2, sold: 2 },
    };
    await api().post('/training/seed').expect(200).expect(summary);
    const pets = (await api().get('/pet').expect(200)).body;
    expect(pets.map((p: { name: string }) => p.name)).toEqual([
      'Milo',
      'Luna',
      'Bella',
      'Max',
      'Coco',
      'Pip',
    ]);
    expect(pets.map((p: { id: number }) => p.id)).toEqual([1, 2, 3, 4, 5, 6]);
    await api().get('/store/inventory').expect(200).expect(summary.inventory);
    const orders = [];
    for (let id = 1; id <= 3; id++) {
      const order = (await api().get(`/store/order/${id}`).expect(200)).body;
      expect(pets.some((p: { id: number }) => p.id === order.petId)).toBe(true);
      orders.push(order);
    }
    expect(orders.map((o) => o.status)).toEqual([
      'placed',
      'approved',
      'delivered',
    ]);
    expect(orders[2].complete).toBe(true);
    await api().get('/store/order/4').expect(404);
    await api().delete('/pet/1').expect(409);
    await api()
      .put('/pet')
      .send({ id: 1, name: 'Changed', photoUrls: [] })
      .expect(200);
    await api().post('/pet').send(pet).expect(201);
    await api().post('/store/order').send({ petId: 7 }).expect(201);
    await api().post('/training/seed').expect(200).expect(summary);
    await api().get('/pet').expect(200).expect(pets);
    for (const order of orders)
      await api().get(`/store/order/${order.id}`).expect(200).expect(order);
    await api().get('/pet/7').expect(404);
    await api().get('/store/order/4').expect(404);
    await app.close();
    await open();
    await api().get('/pet').expect(200).expect(pets);
    await api().get('/store/order/3').expect(200).expect(orders[2]);
  });
  it('clears orders before pets, remains reusable, and persists the empty database', async () => {
    await api().post('/training/seed').expect(200);
    await api()
      .delete('/training/database')
      .expect(204)
      .then((r) => expect(r.text).toBe(''));
    await api().delete('/training/database').expect(204);
    await app.close();
    await open();
    await api().get('/pet').expect(200).expect([]);
    await api()
      .get('/store/inventory')
      .expect(200)
      .expect({ available: 0, pending: 0, sold: 0 });
    for (let id = 1; id <= 3; id++)
      await api().get(`/store/order/${id}`).expect(404);
    const created = (await api().post('/pet').send(pet).expect(201)).body;
    expect(created.id).toBe(1);
    const order = (
      await api().post('/store/order').send({ petId: created.id }).expect(201)
    ).body;
    expect(order.id).toBe(1);
    await api().delete('/pet/1').expect(409);
  });
  it('rolls back a failed seed without losing original records or ID sequences', async () => {
    const existing = (await api().post('/pet').send(pet).expect(201)).body;
    const order = (
      await api().post('/store/order').send({ petId: existing.id }).expect(201)
    ).body;
    const db = app.get(DatabaseProvider).db;
    db.exec(
      "CREATE TEMP TRIGGER fail_seed BEFORE INSERT ON pets WHEN NEW.name = 'Luna' BEGIN SELECT RAISE(ABORT, 'Seed failure'); END",
    );
    expect(() => app.get(TrainingService).seed()).toThrow('Seed failure');
    db.exec('DROP TRIGGER fail_seed');
    await api().get('/pet').expect(200).expect([existing]);
    await api().get(`/store/order/${order.id}`).expect(200).expect(order);
    expect((await api().post('/pet').send(pet).expect(201)).body.id).toBe(2);
  });
  it.each(['0', '-1', '1.5', 'abc', '1e2', '9007199254740992'])(
    'rejects malformed ID %s',
    async (id) => {
      for (const route of [`/pet/${id}`, `/store/order/${id}`]) {
        await api().get(route).expect(400);
        await api().delete(route).expect(400);
      }
    },
  );
  it('accepts the maximum safe ID and reports missing records', async () => {
    await api().get('/pet/9007199254740991').expect(404);
    await api().get('/store/order/9007199254740991').expect(404);
  });
  it.each([
    {},
    { photoUrls: [] },
    { name: 'x' },
    { ...pet, name: '  ' },
    { ...pet, name: 1 },
    { ...pet, photoUrls: 'x' },
    { ...pet, photoUrls: [1] },
    { ...pet, status: 'lost' },
    { ...pet, status: null },
    { ...pet, id: 1 },
    { ...pet, unknown: true },
    { ...pet, category: { id: -1 } },
    { ...pet, category: { name: ' ' } },
    { ...pet, category: { unknown: true } },
    { ...pet, category: [] },
    { ...pet, category: null },
    { ...pet, tags: [{ id: 1.5 }] },
    { ...pet, tags: [{ name: 42 }] },
    { ...pet, tags: [{ unknown: true }] },
    { ...pet, tags: ['x'] },
    { ...pet, tags: [null] },
  ])('rejects invalid pet input %#', async (body) => {
    await api().post('/pet').send(body).expect(400);
    if (!('id' in body))
      await api()
        .put('/pet')
        .send({ ...body, id: 1 })
        .expect(400);
  });
  it('requires a safe ID for replacement', async () => {
    for (const id of [undefined, 0, 1.5, '1', Number.MAX_SAFE_INTEGER + 1]) {
      await api()
        .put('/pet')
        .send({ ...pet, id })
        .expect(400);
    }
  });
  it.each([
    {},
    { petId: 0 },
    { petId: '1' },
    { petId: Number.MAX_SAFE_INTEGER + 1 },
    { petId: 1, quantity: 0 },
    { petId: 1, quantity: -1 },
    { petId: 1, quantity: 1.5 },
    { petId: 1, quantity: '2' },
    { petId: 1, quantity: null },
    { petId: 1, quantity: Number.MAX_SAFE_INTEGER + 1 },
    { petId: 1, status: 'cancelled' },
    { petId: 1, complete: 'false' },
    { petId: 1, shipDate: 'tomorrow' },
    { petId: 1, shipDate: '2026-02-30T00:00:00Z' },
    { petId: 1, shipDate: '2026-10-10' },
    { petId: 1, userId: 1 },
    { petId: 1, id: 2 },
  ])('rejects invalid order input %#', async (body) => {
    await api().post('/store/order').send(body).expect(400);
  });
  it.each([
    '/pet/findByStatus',
    '/pet/findByStatus?status=lost',
    '/pet/findByStatus?status=',
    '/pet/findByStatus?status=available&unknown=x',
    '/pet/findByTags',
    '/pet/findByTags?tags=',
    '/pet/findByTags?tags=cute&unknown=x',
  ])('rejects invalid filter %s', async (path) => {
    await api().get(path).expect(400);
  });
  it('serves Swagger UI and complete request, response, and error schemas', async () => {
    await api()
      .get('/docs/')
      .expect(200)
      .then((r) => expect(r.text).toContain('swagger-ui'));
    await api().get('/docs/swagger-ui-init.js').expect(200);
    const document = (await api().get('/docs-json').expect(200)).body;
    const schemas = document.components.schemas;
    expect(schemas.CreatePetDto.required).toEqual(
      expect.arrayContaining(['name', 'photoUrls']),
    );
    expect(schemas.CreatePetDto.properties).not.toHaveProperty('id');
    expect(schemas.UpdatePetDto.required).toContain('id');
    expect(schemas.PetDto.required).toEqual(
      expect.arrayContaining(['id', 'name', 'photoUrls', 'tags', 'status']),
    );
    expect(schemas.CreatePetDto.properties.category).toEqual({
      $ref: '#/components/schemas/CategoryDto',
    });
    expect(schemas.CreatePetDto.properties.tags.items.$ref).toBe(
      '#/components/schemas/TagDto',
    );
    expect(schemas.CreateOrderDto.required).toEqual(['petId']);
    expect(schemas.OrderDto.required).toEqual(
      expect.arrayContaining(['id', 'petId', 'quantity', 'status', 'complete']),
    );
    expect(schemas.InventoryDto.required).toHaveLength(3);
    expect(
      document.paths['/pet'].post.requestBody.content['application/json'].schema
        .$ref,
    ).toBe('#/components/schemas/CreatePetDto');
    expect(
      document.paths['/pet'].post.responses['201'].content['application/json']
        .schema.$ref,
    ).toBe('#/components/schemas/PetDto');
    expect(document.paths['/pet/{petId}'].delete.responses).toHaveProperty(
      '409',
    );
    expect(document.paths['/store/order'].post.responses).toHaveProperty('404');
    expect(
      document.paths['/pet/findByStatus'].get.parameters[0].schema.items.enum,
    ).toEqual(['available', 'pending', 'sold']);
    expect(
      document.paths['/training/seed'].post.responses['200'].content[
        'application/json'
      ].schema.$ref,
    ).toBe('#/components/schemas/SeedResultDto');
    expect(
      document.paths['/training/database'].delete.responses,
    ).toHaveProperty('204');
    expect(document.paths).not.toHaveProperty('/user');
  });
});
