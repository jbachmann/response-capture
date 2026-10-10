import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';

describe('Swagger documentation', () => {
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

  it('serves Swagger UI and its local assets', async () => {
    const ui = await request(app.getHttpServer()).get('/docs/').expect(200);
    expect(ui.text).toContain('swagger-ui');
    await request(app.getHttpServer())
      .get('/docs/swagger-ui-bundle.js')
      .expect(200)
      .expect('Content-Type', /javascript/);
    const init = await request(app.getHttpServer()).get('/docs/swagger-ui-init.js').expect(200);
    expect(init.text).toContain('/catalog-submissions');
  });

  it('documents submission requirements, parameters, and responses', async () => {
    const { body: document } = await request(app.getHttpServer()).get('/docs-json').expect(200);
    expect(document.info.title).toBe('Catalog API');
    expect(document.paths['/']).toBeUndefined();
    const inventory =
      document.paths['/catalog-inventory'].get.responses['200'].content['application/json'].schema;
    expect(inventory.required).toEqual(['systems']);
    expect(inventory.properties.systems.type).toBe('array');
    const system = inventory.properties.systems.items;
    expect(system.required).toEqual(['name', 'catalogs']);
    expect(system.properties.catalogs.type).toBe('array');
    const inventoryCatalog = system.properties.catalogs.items;
    expect(inventoryCatalog.required).toEqual(['commitHash', 'submittedOn']);
    expect(Object.keys(inventoryCatalog.properties).sort()).toEqual([
      'alias',
      'commitHash',
      'submittedOn',
    ]);
    expect(inventoryCatalog.properties.submittedOn).toEqual({
      type: 'string',
      format: 'date-time',
    });
    const list = document.paths['/catalog-submission'].get;
    const listSchema = list.responses['200'].content['application/json'].schema;
    expect(listSchema.type).toBe('array');
    expect(listSchema.items.required).toEqual([
      'systemName',
      'commitHash',
      'catalog',
      'submittedAt',
    ]);
    expect(listSchema.items.properties.submittedAt).toEqual({
      type: 'string',
      format: 'date-time',
    });
    const submission = document.paths['/catalog-submissions'].put;
    expect(submission.requestBody.required).toBe(true);
    const schema = submission.requestBody.content['application/json'].schema;
    expect(schema.required).toEqual(['systemName', 'commitHash', 'catalog']);
    expect(schema.properties.catalog).toMatchObject({
      type: 'object',
      additionalProperties: true,
    });
    expect(Object.keys(submission.responses).sort()).toEqual(['204', '400', '413']);
    expect(submission.responses['204'].content).toBeUndefined();
    for (const path of ['/catalogs/{systemName}', '/catalogs/{systemName}/{selector}']) {
      const operation = document.paths[path].get;
      expect(operation.parameters).toContainEqual(
        expect.objectContaining({
          name: 'systemName',
          in: 'path',
          required: true,
          schema: expect.objectContaining({ type: 'string' }),
        }),
      );
      expect(operation.responses['200'].content['application/json'].schema).toEqual({
        type: 'object',
        additionalProperties: true,
      });
      expect(operation.responses['404']).toBeDefined();
    }
    expect(document.paths['/catalogs/{systemName}/{selector}'].get.parameters).toContainEqual(
      expect.objectContaining({ name: 'selector', in: 'path', required: true }),
    );
    await request(app.getHttpServer()).get('/docs-yaml').expect(200).expect('Content-Type', /yaml/);
  });
});
