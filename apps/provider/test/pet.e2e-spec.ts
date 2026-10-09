import { pet, usePetstoreFixture } from './support/petstore-fixture.js';

describe('pet behavior (e2e)', () => {
  const fixture = usePetstoreFixture();
  const { api, scenarios } = fixture;

  it('records asserted Petstore success and error examples', async () => {
    const recorder = scenarios('petstore-examples');
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
    const recorder = scenarios();
    await api().get('/').expect(200).expect('Hello World!');
    await recorder.recordScenario(
      'pet.list.empty',
      { method: 'GET', path: '/pet' },
      (test) => test.expect(200).expect([]),
    );
    await recorder.recordScenario(
      'store.inventory.empty',
      { method: 'GET', path: '/store/inventory' },
      (test) => test.expect(200).expect({ available: 0, pending: 0, sold: 0 }),
    );
    await recorder.flush();
  });

  it('creates, lists, reads, replaces, and deletes pets', async () => {
    const recorder = scenarios();
    const body = {
      ...pet,
      category: { id: 1, name: 'Cat' },
      tags: [{ id: 2, name: 'cute' }],
      status: 'sold',
    };
    const created = (
      await recorder.recordScenario(
        'pet.create.with-category-and-tags',
        { method: 'POST', path: '/pet', body },
        async (test) => {
          const response = await test.expect(201);
          expect(response.body).toMatchObject({
            ...pet,
            id: 1,
            status: 'sold',
          });
          return response;
        },
      )
    ).body;
    await recorder.recordScenario(
      'pet.read.success',
      { method: 'GET', path: '/pet/1' },
      (test) => test.expect(200).expect(created),
    );
    await api().get('/pet').expect(200).expect([created]);
    const replaced = { id: 1, name: 'New name', photoUrls: [] };
    await recorder.recordScenario(
      'pet.replace.resets-defaults',
      { method: 'PUT', path: '/pet', body: replaced },
      (test) =>
        test.expect(200).expect({ ...replaced, tags: [], status: 'available' }),
    );
    await recorder.recordScenario(
      'pet.delete.after-replacement',
      { method: 'DELETE', path: '/pet/1' },
      async (test) => {
        const response = await test.expect(204);
        expect(response.text).toBe('');
        return response;
      },
    );
    await recorder.recordScenario(
      'pet.read.after-deletion',
      { method: 'GET', path: '/pet/1' },
      (test) => test.expect(404),
    );
    await recorder.recordScenario(
      'pet.delete.missing',
      { method: 'DELETE', path: '/pet/1' },
      (test) => test.expect(404),
    );
    await recorder.recordScenario(
      'pet.replace.missing',
      { method: 'PUT', path: '/pet', body: { ...pet, id: 1 } },
      (test) => test.expect(404),
    );
    await recorder.flush();
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

  it.each([
    { label: 'missing required fields', body: {} },
    { label: 'missing name', body: { photoUrls: [] } },
    { label: 'missing photo URLs', body: { name: 'x' } },
    { label: 'blank name', body: { ...pet, name: '  ' } },
    { label: 'non-string name', body: { ...pet, name: 1 } },
    { label: 'non-array photo URLs', body: { ...pet, photoUrls: 'x' } },
    { label: 'non-string photo URL', body: { ...pet, photoUrls: [1] } },
    { label: 'unknown status', body: { ...pet, status: 'lost' } },
    { label: 'null status', body: { ...pet, status: null } },
    { label: 'caller-supplied ID', body: { ...pet, id: 1 } },
    { label: 'unknown property', body: { ...pet, unknown: true } },
    { label: 'negative category ID', body: { ...pet, category: { id: -1 } } },
    { label: 'blank category name', body: { ...pet, category: { name: ' ' } } },
    {
      label: 'unknown category property',
      body: { ...pet, category: { unknown: true } },
    },
    { label: 'array category', body: { ...pet, category: [] } },
    { label: 'null category', body: { ...pet, category: null } },
    { label: 'fractional tag ID', body: { ...pet, tags: [{ id: 1.5 }] } },
    { label: 'non-string tag name', body: { ...pet, tags: [{ name: 42 }] } },
    {
      label: 'unknown tag property',
      body: { ...pet, tags: [{ unknown: true }] },
    },
    { label: 'non-object tag', body: { ...pet, tags: ['x'] } },
    { label: 'null tag', body: { ...pet, tags: [null] } },
  ])('rejects $label', async ({ body }) => {
    await api().post('/pet').send(body).expect(400);
    if (!('id' in body)) {
      await api()
        .put('/pet')
        .send({ ...body, id: 1 })
        .expect(400);
    }
  });

  it('accepts omitted optional fields but rejects explicit null, including nested values', async () => {
    await api()
      .post('/pet')
      .send({ ...pet, category: {}, tags: [{}] })
      .expect(201);
    for (const field of ['category', 'tags', 'status']) {
      await api()
        .post('/pet')
        .send({ ...pet, [field]: null })
        .expect(400);
      await api()
        .put('/pet')
        .send({ ...pet, id: 1, [field]: null })
        .expect(400);
    }
    for (const field of ['id', 'name']) {
      await api()
        .post('/pet')
        .send({ ...pet, category: { [field]: null } })
        .expect(400);
      await api()
        .post('/pet')
        .send({ ...pet, tags: [{ [field]: null }] })
        .expect(400);
    }
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
});
