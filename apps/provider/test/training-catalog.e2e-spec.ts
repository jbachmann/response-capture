import { readFile } from 'node:fs/promises';
import { usePetstoreFixture } from './support/petstore-fixture.js';

vi.mock('node:fs/promises', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:fs/promises')>()),
  readFile: vi.fn(),
}));

describe('training catalog (e2e)', () => {
  const { api } = usePetstoreFixture();

  beforeEach(() => {
    vi.mocked(readFile).mockReset();
  });

  it('returns the JSON catalog and reads updates on subsequent requests', async () => {
    const catalog = { catalogVersion: 1, scenarios: [] };
    vi.mocked(readFile).mockResolvedValueOnce(JSON.stringify(catalog));
    await api()
      .get('/training/catalog')
      .expect(200)
      .expect('Content-Type', /json/)
      .expect(catalog);
    expect(readFile).toHaveBeenCalledWith(
      'artifacts/api-scenarios/catalog.json',
      'utf8',
    );

    const updated = { ...catalog, scenarios: [{ id: 'pet.list' }] };
    vi.mocked(readFile).mockResolvedValueOnce(JSON.stringify(updated));
    await api().get('/training/catalog').expect(200).expect(updated);
  });

  it('returns 404 when the catalog has not been generated', async () => {
    vi.mocked(readFile).mockRejectedValueOnce(
      Object.assign(new Error('Missing file'), { code: 'ENOENT' }),
    );
    const response = await api().get('/training/catalog').expect(404);
    expect(response.body.message).toBe(
      'The API scenario catalog has not been generated',
    );
  });
});
