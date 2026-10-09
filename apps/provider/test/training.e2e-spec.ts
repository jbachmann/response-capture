import { pet, usePetstoreFixture } from './support/petstore-fixture.js';
import { DatabaseProvider } from '../src/pet-store/database.provider.js';
import { TrainingService } from '../src/pet-store/training.service.js';

describe('training behavior (e2e)', () => {
  const fixture = usePetstoreFixture();
  const { api, scenarios } = fixture;

  it('replaces existing data with repeatable static training data', async () => {
    const recorder = scenarios();
    const existing = (await api().post('/pet').send(pet).expect(201)).body;
    await api().post('/store/order').send({ petId: existing.id }).expect(201);
    const summary = {
      pets: 6,
      orders: 3,
      inventory: { available: 2, pending: 2, sold: 2 },
    };
    await recorder.recordScenario(
      'training.seed.replaces-existing',
      { method: 'POST', path: '/training/seed' },
      (test) => test.expect(200).expect(summary),
      {
        title: 'Replace existing data with training examples',
        category: 'Training',
        group: 'Seed the database',
        description:
          'Existing pets and orders are replaced with six pets and three orders, with IDs starting at 1.',
        tags: ['defaults'],
      },
    );
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
    await recorder.recordScenario(
      'training.seed.repeatable',
      { method: 'POST', path: '/training/seed' },
      (test) => test.expect(200).expect(summary),
      {
        title: 'Repeat the training seed',
        category: 'Training',
        group: 'Seed the database',
        description:
          'After modifying and adding data, seeding again restores the same six pets and three orders.',
        tags: ['repeatability'],
      },
    );
    await api().get('/pet').expect(200).expect(pets);
    for (const order of orders) {
      await api().get(`/store/order/${order.id}`).expect(200).expect(order);
    }
    await api().get('/pet/7').expect(404);
    await api().get('/store/order/4').expect(404);
    await fixture.reopen();
    await api().get('/pet').expect(200).expect(pets);
    await api().get('/store/order/3').expect(200).expect(orders[2]);
    await recorder.flush();
  });

  it('clears orders before pets, remains reusable, and persists the empty database', async () => {
    const recorder = scenarios();
    await api().post('/training/seed').expect(200);
    await recorder.recordScenario(
      'training.database.clear',
      { method: 'DELETE', path: '/training/database' },
      async (test) => {
        const response = await test.expect(204);
        expect(response.text).toBe('');
        return response;
      },
      {
        title: 'Clear the training database',
        category: 'Training',
        group: 'Clear the database',
        description:
          'After seeding, deletes all orders and pets and resets their ID sequences.',
        tags: [],
      },
    );
    await recorder.recordScenario(
      'training.database.clear-already-empty',
      { method: 'DELETE', path: '/training/database' },
      (test) => test.expect(204),
      {
        title: 'Clear an already empty database',
        category: 'Training',
        group: 'Clear the database',
        description:
          'Clearing a second time succeeds without requiring any existing records.',
        tags: ['repeatability', 'empty-results'],
      },
    );
    await fixture.reopen();
    await api().get('/pet').expect(200).expect([]);
    await api()
      .get('/store/inventory')
      .expect(200)
      .expect({ available: 0, pending: 0, sold: 0 });
    for (let id = 1; id <= 3; id++) {
      await api().get(`/store/order/${id}`).expect(404);
    }
    const created = (await api().post('/pet').send(pet).expect(201)).body;
    expect(created.id).toBe(1);
    const order = (
      await api().post('/store/order').send({ petId: created.id }).expect(201)
    ).body;
    expect(order.id).toBe(1);
    await api().delete('/pet/1').expect(409);
    await recorder.flush();
  });

  it('rolls back a failed seed without losing original records or ID sequences', async () => {
    const existing = (await api().post('/pet').send(pet).expect(201)).body;
    const order = (
      await api().post('/store/order').send({ petId: existing.id }).expect(201)
    ).body;
    const db = fixture.app.get(DatabaseProvider).db;
    db.exec(
      "CREATE TEMP TRIGGER fail_seed BEFORE INSERT ON pets WHEN NEW.name = 'Luna' BEGIN SELECT RAISE(ABORT, 'Seed failure'); END",
    );
    expect(() => fixture.app.get(TrainingService).seed()).toThrow(
      'Seed failure',
    );
    db.exec('DROP TRIGGER fail_seed');
    await api().get('/pet').expect(200).expect([existing]);
    await api().get(`/store/order/${order.id}`).expect(200).expect(order);
    expect((await api().post('/pet').send(pet).expect(201)).body.id).toBe(2);
  });
});
