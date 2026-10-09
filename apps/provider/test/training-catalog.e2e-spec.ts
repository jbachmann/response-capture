import { usePetstoreFixture } from './support/petstore-fixture.js';

describe('removed training catalog endpoint (e2e)', () => {
  const { api } = usePetstoreFixture();

  it('returns 404 and is absent from OpenAPI', async () => {
    await api().get('/training/catalog').expect(404);
    const { body: document } = await api().get('/docs-json').expect(200);
    expect(document.paths['/training/catalog']).toBeUndefined();
    expect(document.paths['/training/seed'].post).toBeDefined();
    expect(document.paths['/training/database'].delete).toBeDefined();
  });
});
