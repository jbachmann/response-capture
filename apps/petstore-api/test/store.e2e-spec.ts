import { capture } from '@response-capture/scenario-recorder/supertest';
import { pet, usePetstoreFixture } from './support/petstore-fixture.js';

describe('store behavior (e2e)', () => {
  const fixture = usePetstoreFixture();
  const { api } = fixture;

  it('lists all persisted orders newest first and excludes deleted orders', async () => {
    await api().get('/store/order').expect(200).expect([]);
    const savedPet = (await api().post('/pet').send(pet).expect(201)).body;
    const first = (await api().post('/store/order').send({ petId: savedPet.id }).expect(201)).body;
    const second = (
      await api()
        .post('/store/order')
        .send({
          petId: savedPet.id,
          quantity: 2,
          shipDate: '2026-10-10T12:00:00Z',
          status: 'delivered',
          complete: true,
        })
        .expect(201)
    ).body;
    await api().get('/store/order').expect(200).expect([second, first]);
    await fixture.reopen();
    await api().get('/store/order').expect(200).expect([second, first]);
    await api().delete(`/store/order/${second.id}`).expect(204);
    await api().get('/store/order').expect(200).expect([first]);
    await api().delete(`/store/order/${first.id}`).expect(204);
    await api().get('/store/order').expect(200).expect([]);
    const document = (await api().get('/docs-json').expect(200)).body;
    expect(
      document.paths['/store/order'].get.responses['200'].content['application/json'].schema,
    ).toEqual({
      type: 'array',
      items: { $ref: '#/components/schemas/OrderDto' },
    });
  });

  it('creates and deletes orders, protects pets, and leaves pet status unchanged', async () => {
    await api()
      .post('/store/order')
      .send({ petId: 99 })
      .use(
        capture('store.order.create.missing-pet', {
          title: 'Reject an order for a missing pet',
          category: 'Orders',
          group: 'Create an order',
          description: 'No pet with ID 99 exists, so the order cannot be created.',
          tags: ['relationships'],
        }),
      )
      .expect(404);
    await api().post('/pet').send(pet).expect(201);
    const createdOrderResponse = await api()
      .post('/store/order')
      .send({ petId: 1 })
      .use(
        capture('store.order.create.defaults', {
          title: 'Create an order with defaults',
          category: 'Orders',
          group: 'Create an order',
          description:
            'After creating pet 1, an order defaults to quantity 1, placed status, and incomplete.',
          tags: ['defaults', 'relationships'],
        }),
      )
      .expect(201);
    expect(createdOrderResponse.body).toEqual({
      id: 1,
      petId: 1,
      quantity: 1,
      status: 'placed',
      complete: false,
    });
    const order = createdOrderResponse.body;
    await api()
      .get('/store/order/1')
      .use(
        capture('store.order.read.success', {
          title: 'Read an existing order',
          category: 'Orders',
          group: 'Read an order',
          description: 'Returns the previously created order and its default values.',
          tags: [],
        }),
      )
      .expect(200)
      .expect(order);
    await api()
      .delete('/pet/1')
      .use(
        capture('pet.delete.referenced-by-order', {
          title: 'Cannot delete a pet linked to an order',
          category: 'Pets',
          group: 'Delete a pet',
          description:
            'An existing order references pet 1, so deletion is rejected with a conflict.',
          tags: ['relationships'],
        }),
      )
      .expect(409);
    await api()
      .get('/pet/1')
      .expect(200)
      .then((r) => expect(r.body.status).toBe('available'));
    await api()
      .get('/store/inventory')
      .use(
        capture('store.inventory.with-order', {
          title: 'Read inventory after creating an order',
          category: 'Inventory',
          group: 'Read inventory',
          description:
            'Creating an order leaves its pet status unchanged, so inventory still counts one available pet.',
          tags: ['relationships'],
        }),
      )
      .expect(200)
      .expect({ available: 1, pending: 0, sold: 0 });
    const deletedOrderResponse = await api()
      .delete('/store/order/1')
      .use(
        capture('store.order.delete.success', {
          title: 'Delete an existing order',
          category: 'Orders',
          group: 'Delete an order',
          description: 'Deletes order 1 while preserving its pet and returns no response body.',
          tags: ['relationships'],
        }),
      )
      .expect(204);
    expect(deletedOrderResponse.text).toBe('');
    await api()
      .get('/store/order/1')
      .use(
        capture('store.order.read.missing', {
          title: 'Read a deleted order',
          category: 'Orders',
          group: 'Read an order',
          description: 'After deleting order 1, reading it reports that it no longer exists.',
          tags: [],
        }),
      )
      .expect(404);
    await api()
      .delete('/store/order/1')
      .use(
        capture('store.order.delete.missing', {
          title: 'Delete an order that does not exist',
          category: 'Orders',
          group: 'Delete an order',
          description:
            'The order has already been deleted, so a second deletion reports it as missing.',
          tags: [],
        }),
      )
      .expect(404);
    const remainingPetResponse = await api()
      .get('/pet/1')
      .use(
        capture('pet.read.after-order-deletion', {
          title: 'Read a pet after deleting its order',
          category: 'Pets',
          group: 'Read a pet',
          description: 'Deleting an order leaves its pet available and readable.',
          tags: ['relationships'],
        }),
      )
      .expect(200);
    expect(remainingPetResponse.body.status).toBe('available');
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
    await fixture.reopen();

    await api()
      .get(`/pet/${savedPet.id}`)
      .use(
        capture('pet.read.persisted', {
          title: 'Read a pet after reopening the database',
          category: 'Pets',
          group: 'Read a pet',
          description:
            'A saved pet retains its nested category, tags, and status after the application reopens the database.',
          tags: ['persistence'],
        }),
      )
      .expect(200)
      .expect(savedPet);
    await api()
      .get(`/store/order/${savedOrder.id}`)
      .use(
        capture('store.order.read.persisted', {
          title: 'Read an order after reopening the database',
          category: 'Orders',
          group: 'Read an order',
          description:
            'The saved quantity, shipping date, status, and completion flag survive reopening the database.',
          tags: ['persistence'],
        }),
      )
      .expect(200)
      .expect(savedOrder);
    await api().delete(`/pet/${savedPet.id}`).expect(409);
    const next = (await api().post('/pet').send(pet).expect(201)).body;
    expect(next.id).toBeGreaterThan(savedPet.id);
  });

  it('accepts omitted order fields but rejects explicit null', async () => {
    await api().post('/pet').send(pet).expect(201);
    await api().post('/store/order').send({ petId: 1 }).expect(201);
    for (const field of ['quantity', 'shipDate', 'status', 'complete']) {
      await api()
        .post('/store/order')
        .send({ petId: 1, [field]: null })
        .expect(400);
    }
  });

  it.each([
    { label: 'missing pet ID', body: {} },
    { label: 'zero pet ID', body: { petId: 0 } },
    { label: 'string pet ID', body: { petId: '1' } },
    { label: 'unsafe pet ID', body: { petId: Number.MAX_SAFE_INTEGER + 1 } },
    { label: 'zero quantity', body: { petId: 1, quantity: 0 } },
    { label: 'negative quantity', body: { petId: 1, quantity: -1 } },
    { label: 'fractional quantity', body: { petId: 1, quantity: 1.5 } },
    { label: 'string quantity', body: { petId: 1, quantity: '2' } },
    { label: 'null quantity', body: { petId: 1, quantity: null } },
    {
      label: 'unsafe quantity',
      body: { petId: 1, quantity: Number.MAX_SAFE_INTEGER + 1 },
    },
    { label: 'unknown status', body: { petId: 1, status: 'cancelled' } },
    { label: 'string completion flag', body: { petId: 1, complete: 'false' } },
    {
      label: 'invalid shipping date',
      body: { petId: 1, shipDate: 'tomorrow' },
    },
    {
      label: 'nonexistent calendar date',
      body: { petId: 1, shipDate: '2026-02-30T00:00:00Z' },
    },
    { label: 'date without time', body: { petId: 1, shipDate: '2026-10-10' } },
    { label: 'unknown user property', body: { petId: 1, userId: 1 } },
    { label: 'caller-supplied ID', body: { petId: 1, id: 2 } },
  ])('rejects $label', async ({ body }) => {
    await api().post('/store/order').send(body).expect(400);
  });
});
