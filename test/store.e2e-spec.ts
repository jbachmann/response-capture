import { pet, usePetstoreFixture } from './support/petstore-fixture.js';

describe('store behavior (e2e)', () => {
  const fixture = usePetstoreFixture();
  const { api, scenarios } = fixture;

  it('creates and deletes orders, protects pets, and leaves pet status unchanged', async () => {
    const recorder = scenarios();
    await recorder.recordScenario(
      'store.order.create.missing-pet',
      { method: 'POST', path: '/store/order', body: { petId: 99 } },
      (test) => test.expect(404),
    );
    await api().post('/pet').send(pet).expect(201);
    const order = (
      await recorder.recordScenario(
        'store.order.create.defaults',
        { method: 'POST', path: '/store/order', body: { petId: 1 } },
        async (test) => {
          const response = await test.expect(201);
          expect(response.body).toEqual({
            id: 1,
            petId: 1,
            quantity: 1,
            status: 'placed',
            complete: false,
          });
          return response;
        },
      )
    ).body;
    await recorder.recordScenario(
      'store.order.read.success',
      { method: 'GET', path: '/store/order/1' },
      (test) => test.expect(200).expect(order),
    );
    await recorder.recordScenario(
      'pet.delete.referenced-by-order',
      { method: 'DELETE', path: '/pet/1' },
      (test) => test.expect(409),
    );
    await api()
      .get('/pet/1')
      .expect(200)
      .then((r) => expect(r.body.status).toBe('available'));
    await recorder.recordScenario(
      'store.inventory.with-order',
      { method: 'GET', path: '/store/inventory' },
      (test) => test.expect(200).expect({ available: 1, pending: 0, sold: 0 }),
    );
    await recorder.recordScenario(
      'store.order.delete.success',
      { method: 'DELETE', path: '/store/order/1' },
      async (test) => {
        const response = await test.expect(204);
        expect(response.text).toBe('');
        return response;
      },
    );
    await recorder.recordScenario(
      'store.order.read.missing',
      { method: 'GET', path: '/store/order/1' },
      (test) => test.expect(404),
    );
    await recorder.recordScenario(
      'store.order.delete.missing',
      { method: 'DELETE', path: '/store/order/1' },
      (test) => test.expect(404),
    );
    await recorder.recordScenario(
      'pet.read.after-order-deletion',
      { method: 'GET', path: '/pet/1' },
      async (test) => {
        const response = await test.expect(200);
        expect(response.body.status).toBe('available');
        return response;
      },
    );
    await api().delete('/pet/1').expect(204);
    await recorder.flush();
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
    const recorder = scenarios();
    await recorder.recordScenario(
      'pet.read.persisted',
      { method: 'GET', path: `/pet/${savedPet.id}` },
      (test) => test.expect(200).expect(savedPet),
    );
    await recorder.recordScenario(
      'store.order.read.persisted',
      { method: 'GET', path: `/store/order/${savedOrder.id}` },
      (test) => test.expect(200).expect(savedOrder),
    );
    await api().delete(`/pet/${savedPet.id}`).expect(409);
    const next = (await api().post('/pet').send(pet).expect(201)).body;
    expect(next.id).toBeGreaterThan(savedPet.id);
    await recorder.flush();
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
