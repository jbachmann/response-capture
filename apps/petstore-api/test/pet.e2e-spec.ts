import { capture } from '@response-capture/scenario-recorder/supertest';
import { pet, usePetstoreFixture } from './support/petstore-fixture.js';

describe('pet behavior (e2e)', () => {
  const fixture = usePetstoreFixture();
  const { api } = fixture;

  it('creates, lists, and deletes pets with success and error responses', async () => {
    await api()
      .post('/pet')
      .send(pet)
      .use(
        capture('pet.create.success', {
          title: 'Create a pet with defaults',
          category: 'Pets',
          group: 'Create a pet',
          description: 'Creates Milo with no category or tags and the default available status.',
          tags: ['defaults'],
          requestMatch: { bodyContains: { name: 'Milo' } },
        }),
      )
      .expect(201)
      .expect({ ...pet, id: 1, tags: [], status: 'available' });
    await api()
      .post('/pet')
      .send({})
      .use(
        capture('pet.create.invalid', {
          title: 'Reject a pet with missing fields',
          category: 'Pets',
          group: 'Create a pet',
          description: 'An empty request is rejected because a name and photo URLs are required.',
          tags: [],
        }),
      )
      .expect(400);
    await api()
      .get('/pet/999')
      .use(
        capture('pet.read.missing', {
          title: 'Read a pet that does not exist',
          category: 'Pets',
          group: 'Read a pet',
          description: 'Pet 999 has not been created, so the API reports it as missing.',
          tags: [],
        }),
      )
      .expect(404);
    const listedPets = await api()
      .get('/pet')
      .use(
        capture('pet.list.success', {
          title: 'List existing pets',
          category: 'Pets',
          group: 'List pets',
          description: 'After creating Milo, the list contains that pet.',
          tags: [],
        }),
      )
      .expect(200);
    expect(listedPets.body).toEqual([{ ...pet, id: 1, tags: [], status: 'available' }]);
    await api()
      .delete('/pet/1')
      .use(
        capture('pet.delete.success', {
          title: 'Delete an existing pet',
          category: 'Pets',
          group: 'Delete a pet',
          description: 'Deletes a pet with no referencing orders and returns no response body.',
          tags: [],
        }),
      )
      .expect(204);
  });

  it('has no greeting route and starts empty', async () => {
    await api().get('/').expect(404);
    await api()
      .get('/pet')
      .use(
        capture('pet.list.empty', {
          title: 'List pets in an empty database',
          category: 'Pets',
          group: 'List pets',
          description: 'A fresh database returns an empty list.',
          tags: ['empty-results'],
        }),
      )
      .expect(200)
      .expect([]);
    await api()
      .get('/store/inventory')
      .use(
        capture('store.inventory.empty', {
          title: 'Read inventory in an empty database',
          category: 'Inventory',
          group: 'Read inventory',
          description: 'All pet status counts are zero in a fresh database.',
          tags: ['empty-results'],
        }),
      )
      .expect(200)
      .expect({ available: 0, pending: 0, sold: 0 });
  });

  it('creates, lists, reads, replaces, and deletes pets', async () => {
    const body = {
      ...pet,
      category: { id: 1, name: 'Cat' },
      tags: [{ id: 2, name: 'cute' }],
      status: 'sold',
    };
    const createdPetResponse = await api()
      .post('/pet')
      .send(body)
      .use(
        capture('pet.create.with-category-and-tags', {
          title: 'Create a pet with category and tags',
          category: 'Pets',
          group: 'Create a pet',
          description: 'Creates a sold pet with an explicit category and tag.',
          tags: [],
        }),
      )
      .expect(201);
    expect(createdPetResponse.body).toMatchObject({
      ...pet,
      id: 1,
      status: 'sold',
    });
    const created = createdPetResponse.body;
    await api()
      .get('/pet/1')
      .use(
        capture('pet.read.success', {
          title: 'Read an existing pet',
          category: 'Pets',
          group: 'Read a pet',
          description: 'Returns the previously created pet, including its category and tags.',
          tags: [],
        }),
      )
      .expect(200)
      .expect(created);
    await api().get('/pet').expect(200).expect([created]);
    const replaced = { id: 1, name: 'New name', photoUrls: [] };
    await api()
      .put('/pet')
      .send(replaced)
      .use(
        capture('pet.replace.resets-defaults', {
          title: 'Replace a pet and reset optional fields',
          category: 'Pets',
          group: 'Replace a pet',
          description:
            'Omitting category, tags, and status during replacement removes the category and restores defaults.',
          tags: ['defaults'],
        }),
      )
      .expect(200)
      .expect({ ...replaced, tags: [], status: 'available' });
    const deletedPetResponse = await api()
      .delete('/pet/1')
      .use(
        capture('pet.delete.after-replacement', {
          title: 'Delete a replaced pet',
          category: 'Pets',
          group: 'Delete a pet',
          description: 'After replacing the pet, deletion succeeds and returns no response body.',
          tags: [],
        }),
      )
      .expect(204);
    expect(deletedPetResponse.text).toBe('');
    await api()
      .get('/pet/1')
      .use(
        capture('pet.read.after-deletion', {
          title: 'Read a deleted pet',
          category: 'Pets',
          group: 'Read a pet',
          description: 'After deleting pet 1, reading it reports that it no longer exists.',
          tags: [],
        }),
      )
      .expect(404);
    await api()
      .delete('/pet/1')
      .use(
        capture('pet.delete.missing', {
          title: 'Delete a pet that does not exist',
          category: 'Pets',
          group: 'Delete a pet',
          description:
            'The pet has already been deleted, so a second deletion reports it as missing.',
          tags: [],
        }),
      )
      .expect(404);
    await api()
      .put('/pet')
      .send({ ...pet, id: 1 })
      .use(
        capture('pet.replace.missing', {
          title: 'Replace a pet that does not exist',
          category: 'Pets',
          group: 'Replace a pet',
          description: 'Replacing a previously deleted pet reports it as missing.',
          tags: [],
        }),
      )
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
    for (const query of ['tags=big,cute', 'tags=big&tags=cute', 'tags=big,cute&tags=small']) {
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
    await api().get('/store/inventory').expect(200).expect({ available: 1, pending: 1, sold: 1 });
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
