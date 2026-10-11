import { capture } from '@response-capture/scenario-recorder/supertest';
import { usePetstoreFixture } from './support/petstore-fixture.js';

describe('API contract (e2e)', () => {
  const fixture = usePetstoreFixture();
  const { api } = fixture;

  it.each(['0', '-1', '1.5', 'abc', '1e2', '9007199254740992'])(
    'rejects malformed ID %s',
    async (id) => {
      for (const [resource, path] of [
        ['pet', `/pet/${id}`],
        ['store.order', `/store/order/${id}`],
      ]) {
        await api()
          .get(path)
          .use(
            capture(`${resource}.read.invalid-id.${id}`, {
              title: `Reject reading a ${resource === 'pet' ? 'pet' : 'order'} with ID ${id}`,
              category: resource === 'pet' ? 'Pets' : 'Orders',
              group: resource === 'pet' ? 'Read a pet' : 'Read an order',
              description: `ID ${id} is not a positive safe integer in the accepted format; the request is rejected.`,
              tags: ['boundary-values'],
            }),
          )
          .expect(400);
        await api()
          .delete(path)
          .use(
            capture(`${resource}.delete.invalid-id.${id}`, {
              title: `Reject deleting a ${resource === 'pet' ? 'pet' : 'order'} with ID ${id}`,
              category: resource === 'pet' ? 'Pets' : 'Orders',
              group: resource === 'pet' ? 'Delete a pet' : 'Delete an order',
              description: `ID ${id} is not a positive safe integer in the accepted format; the request is rejected.`,
              tags: ['boundary-values'],
            }),
          )
          .expect(400);
      }
    },
  );

  it('accepts the maximum safe ID and reports missing records', async () => {
    await api()
      .get('/pet/9007199254740991')
      .use(
        capture('pet.read.maximum-safe-id', {
          title: 'Read a missing pet at the maximum safe ID',
          category: 'Pets',
          group: 'Read a pet',
          description: 'The largest safe integer is a valid ID, but no pet with that ID exists.',
          tags: ['boundary-values'],
        }),
      )
      .expect(404);
    await api()
      .get('/store/order/9007199254740991')
      .use(
        capture('store.order.read.maximum-safe-id', {
          title: 'Read a missing order at the maximum safe ID',
          category: 'Orders',
          group: 'Read an order',
          description: 'The largest safe integer is a valid ID, but no order with that ID exists.',
          tags: ['boundary-values'],
        }),
      )
      .expect(404);
  });

  it('serves Scalar and complete request, response, and error schemas', async () => {
    for (const path of ['/docs', '/docs/']) {
      const ui = await api().get(path).expect(200);
      expect(ui.headers['content-type']).toMatch(/html/);
      expect(ui.text).toContain('src="/docs/scalar.js"');
      expect(ui.text).toContain('"url": "/docs-json"');
      expect(ui.text).toContain('"withDefaultFonts": false');
      expect(ui.text).not.toContain('cdn.jsdelivr.net');
    }
    const bundle = await api()
      .get('/docs/scalar.js')
      .expect(200)
      .expect('Content-Type', /javascript/);
    expect(bundle.text).toContain('createApiReference');
    await api().get('/docs/swagger-ui-init.js').expect(404);
    await api().get('/docs-yaml').expect(200).expect('Content-Type', /yaml/);
    const document = (await api().get('/docs-json').expect(200)).body;
    const schemas = document.components.schemas;
    expect(schemas.CreatePetDto.required).toEqual(expect.arrayContaining(['name', 'photoUrls']));
    expect(schemas.CreatePetDto.properties).not.toHaveProperty('id');
    expect(schemas.UpdatePetDto.required).toContain('id');
    expect(schemas.PetDto.required).toEqual(
      expect.arrayContaining(['id', 'name', 'photoUrls', 'tags', 'status']),
    );
    expect(schemas.CreatePetDto.properties.category).toEqual({
      $ref: '#/components/schemas/CategoryDto',
    });
    expect(schemas.CreatePetDto.properties.tags.items.$ref).toBe('#/components/schemas/TagDto');
    expect(schemas.CreateOrderDto.required).toEqual(['petId']);
    expect(schemas.OrderDto.required).toEqual(
      expect.arrayContaining(['id', 'petId', 'quantity', 'status', 'complete']),
    );
    expect(schemas.InventoryDto.required).toHaveLength(3);
    expect(document.paths['/pet'].post.requestBody.content['application/json'].schema.$ref).toBe(
      '#/components/schemas/CreatePetDto',
    );
    expect(
      document.paths['/pet'].post.responses['201'].content['application/json'].schema.$ref,
    ).toBe('#/components/schemas/PetDto');
    expect(document.paths['/pet/{petId}'].delete.responses).toHaveProperty('409');
    expect(document.paths['/store/order'].post.responses).toHaveProperty('404');
    expect(document.paths['/pet/findByStatus'].get.parameters[0].schema.items.enum).toEqual([
      'available',
      'pending',
      'sold',
    ]);
    expect(
      document.paths['/training/seed'].post.responses['200'].content['application/json'].schema
        .$ref,
    ).toBe('#/components/schemas/SeedResultDto');
    expect(document.paths['/training/database'].delete.responses).toHaveProperty('204');
    expect(document.paths).not.toHaveProperty('/user');
  });
});
