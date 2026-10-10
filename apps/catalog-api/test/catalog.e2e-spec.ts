import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';

describe('catalog API', () => {
  let app: NestExpressApplication;
  beforeEach(async () => {
    vi.stubEnv('CATALOG_DATABASE_PATH', ':memory:');
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication<NestExpressApplication>();
    configureApp(app);
    await app.init();
  });
  afterEach(async () => {
    await app.close();
    vi.unstubAllEnvs();
  });

  it('has no root greeting route', async () => {
    await request(app.getHttpServer()).get('/').expect(404);
  });

  it('returns inventory grouped by system with ISO dates and no catalog payloads', async () => {
    await request(app.getHttpServer()).get('/catalog-inventory').expect(200, { systems: [] });
    for (const submission of [
      {
        systemName: 'provider',
        commitHash: 'one',
        alias: 'main',
        catalog: { privatePayload: true },
      },
      { systemName: 'consumer', commitHash: 'one', catalog: {} },
      { systemName: 'provider', commitHash: 'two', catalog: {} },
      {
        systemName: 'provider',
        commitHash: 'one',
        catalog: { replaced: true },
      },
    ]) {
      await request(app.getHttpServer()).put('/catalog-submissions').send(submission).expect(204);
    }
    const { body } = await request(app.getHttpServer()).get('/catalog-inventory').expect(200);
    expect(body).toEqual({
      systems: [
        {
          name: 'consumer',
          catalogs: [{ commitHash: 'one', submittedOn: expect.any(String) }],
        },
        {
          name: 'provider',
          catalogs: [
            { commitHash: 'one', submittedOn: expect.any(String) },
            { commitHash: 'two', submittedOn: expect.any(String) },
          ],
        },
      ],
    });
    for (const system of body.systems) {
      for (const catalog of system.catalogs) {
        expect(new Date(catalog.submittedOn).toISOString()).toBe(catalog.submittedOn);
      }
    }
  });

  it('lists stored submissions with metadata and catalog payloads', async () => {
    await request(app.getHttpServer()).get('/catalog-submission').expect(200, []);
    const submission = {
      systemName: 'provider',
      commitHash: 'abc',
      alias: 'main',
      catalog: { arbitrary: [null, true] },
    };
    await request(app.getHttpServer()).put('/catalog-submissions').send(submission).expect(204);
    const response = await request(app.getHttpServer()).get('/catalog-submission').expect(200);
    expect(response.body).toEqual([{ ...submission, submittedAt: expect.any(String) }]);
    expect(new Date(response.body[0].submittedAt).toISOString()).toBe(response.body[0].submittedAt);
    const replacement = {
      systemName: 'provider',
      commitHash: 'abc',
      catalog: { replaced: true },
    };
    await request(app.getHttpServer()).put('/catalog-submissions').send(replacement).expect(204);
    const updated = await request(app.getHttpServer()).get('/catalog-submission').expect(200);
    expect(updated.body).toEqual([{ ...replacement, submittedAt: expect.any(String) }]);
  });

  it('stores arbitrary catalogs and returns only payloads through both lookups', async () => {
    const catalog = { arbitrary: [null, true, { nested: 'value' }] };
    await request(app.getHttpServer())
      .put('/catalog-submissions')
      .send({
        systemName: 'any system',
        commitHash: 'abc',
        alias: 'main',
        catalog,
      })
      .expect(204);
    for (const suffix of ['', '/abc', '/main']) {
      await request(app.getHttpServer())
        .get(`/catalogs/any%20system${suffix}`)
        .expect(200, catalog);
    }
    await request(app.getHttpServer())
      .put('/catalog-submissions')
      .send({ systemName: 'any system', commitHash: 'abc', catalog: {} })
      .expect(204);
    await request(app.getHttpServer()).get('/catalogs/any%20system/abc').expect(200, {});
    await request(app.getHttpServer()).get('/catalogs/any%20system/main').expect(404);
    await request(app.getHttpServer()).get('/catalogs/missing').expect(404);
    await request(app.getHttpServer()).get('/catalogs/any%20system/missing').expect(404);
  });

  it.each([
    {},
    { systemName: 's', commitHash: 'c' },
    { systemName: ' ', commitHash: 'c', catalog: {} },
    { systemName: 's', commitHash: '', catalog: {} },
    { systemName: 1, commitHash: 'c', catalog: {} },
    { systemName: 's', commitHash: 1, catalog: {} },
    { systemName: 's', commitHash: 'c', alias: null, catalog: {} },
    { systemName: 's', commitHash: 'c', alias: 1, catalog: {} },
    { systemName: 's', commitHash: 'c', catalog: [] },
    { systemName: 's', commitHash: 'c', catalog: null },
    { systemName: 's', commitHash: 'c', catalog: 'text' },
  ])('rejects invalid submissions: %j', async (submission) => {
    await request(app.getHttpServer()).put('/catalog-submissions').send(submission).expect(400);
    await request(app.getHttpServer()).get('/catalogs/s').expect(404);
  });

  it('accepts catalogs above 100 KiB and rejects requests above 10 MiB', async () => {
    const submission = {
      systemName: 's',
      commitHash: 'c',
      catalog: { data: 'a'.repeat(200_000) },
    };
    await request(app.getHttpServer()).put('/catalog-submissions').send(submission).expect(204);
    await request(app.getHttpServer()).get('/catalogs/s').expect(200, submission.catalog);
    submission.catalog.data = 'a'.repeat(10 * 1024 * 1024);
    await request(app.getHttpServer()).put('/catalog-submissions').send(submission).expect(413);
  });
});
