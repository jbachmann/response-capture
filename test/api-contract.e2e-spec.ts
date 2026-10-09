import { usePetstoreFixture } from './support/petstore-fixture.js';

describe('API contract (e2e)', () => {
  const fixture = usePetstoreFixture();
  const { api, scenarios } = fixture;

  it.each(['0', '-1', '1.5', 'abc', '1e2', '9007199254740992'])(
    'rejects malformed ID %s',
    async (id) => {
      const recorder = scenarios();
      for (const [resource, path] of [
        ['pet', `/pet/${id}`],
        ['store.order', `/store/order/${id}`],
      ]) {
        await recorder.recordScenario(
          `${resource}.read.invalid-id.${id}`,
          { method: 'GET', path },
          (test) => test.expect(400),
        );
        await recorder.recordScenario(
          `${resource}.delete.invalid-id.${id}`,
          { method: 'DELETE', path },
          (test) => test.expect(400),
        );
      }
      await recorder.flush();
    },
  );

  it('accepts the maximum safe ID and reports missing records', async () => {
    const recorder = scenarios();
    await recorder.recordScenario(
      'pet.read.maximum-safe-id',
      { method: 'GET', path: '/pet/9007199254740991' },
      (test) => test.expect(404),
    );
    await recorder.recordScenario(
      'store.order.read.maximum-safe-id',
      { method: 'GET', path: '/store/order/9007199254740991' },
      (test) => test.expect(404),
    );
    await recorder.flush();
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
