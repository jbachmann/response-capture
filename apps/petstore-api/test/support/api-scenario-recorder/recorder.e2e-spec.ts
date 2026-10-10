import 'reflect-metadata';
import { Body, Controller, Get, Post, Res } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { json } from 'express';
import type { Response as ExpressResponse } from 'express';
import request from 'supertest';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createScenarioRecorder, mergeScenarios } from './index.js';
import type { Catalog, Json } from './index.js';

@Controller()
class FixtureController {
  @Post('echo')
  echo(@Body() body: Json, @Res() response: ExpressResponse) {
    response.status(201).json(body);
  }

  @Get('empty')
  empty(@Res() response: ExpressResponse) {
    response.status(204).end();
  }

  @Get('text')
  text() {
    return 'unsupported';
  }
}

describe('scenario capture against NestJS/Express', () => {
  let app: INestApplication;
  let directory: string;
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [FixtureController],
    }).compile();
    app = module.createNestApplication({ bodyParser: false });
    app.use(json({ strict: false }));
    await app.init();
  });
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'recorder-'));
  });
  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });
  afterAll(async () => {
    await app.close();
  });
  const recorder = () =>
    createScenarioRecorder({
      app: app.getHttpServer(),
      suiteId: 'fixture',
      outputDirectory: directory,
    });
  const catalog = async (filename: string) =>
    JSON.parse(await readFile(filename, 'utf8')) as Catalog;

  it('snapshots browsing metadata and preserves it through capture and merge', async () => {
    const capture = recorder();
    const metadata = {
      title: 'Echo an example',
      category: 'Examples',
      group: 'Echo',
      tags: ['nested'],
      description: 'Returns the submitted object.',
    };
    const recording = capture.recordScenario(
      'echo.metadata',
      { method: 'POST', path: '/echo', body: { a: 1 } },
      (test) => test.expect(201),
      metadata,
    );
    metadata.tags.push('later');
    await recording;
    await capture.flush();
    const merged = await catalog(await mergeScenarios(directory));
    expect(merged.scenarios[0]).toMatchObject({
      ...metadata,
      tags: ['nested'],
    });
  });
  it('captures actual JSON objects, arrays, primitives and explicit null', async () => {
    const capture = recorder();
    const bodies: Json[] = [{ nested: { x: 1 } }, [1, { x: true }], 'hello', 42, false, null];
    for (const [index, body] of bodies.entries()) {
      await capture.recordScenario(
        `echo.${index}`,
        { method: 'POST', path: '/echo', body },
        async (test) => {
          const response = await test.expect(201);
          expect(response.body).toEqual(body);
          return response;
        },
      );
    }
    const recorded = (await catalog((await capture.flush())!)).scenarios;
    expect(recorded.map((s) => s.request.body)).toEqual(bodies);
    expect(recorded.map((s) => s.response.body)).toEqual(bodies);
    expect(
      recorded.every(
        (s) =>
          s.request.method === 'POST' && s.request.path === '/echo' && s.response.status === 201,
      ),
    ).toBe(true);
    expect(recorded[0].response.headers).toEqual({
      'content-type': 'application/json; charset=utf-8',
    });
  });
  it('records empty and error responses, but excludes non-opted-in requests and assertion failures', async () => {
    const capture = recorder();
    await request(app.getHttpServer()).get('/empty').expect(204);
    await expect(
      capture.recordScenario('failed', { method: 'GET', path: '/empty' }, (test) =>
        test.expect(201),
      ),
    ).rejects.toThrow();
    await expect(
      capture.recordScenario('late-assertion', { method: 'GET', path: '/empty' }, async (test) => {
        const response = await test.expect(204);
        expect(response.status).toBe(200);
        return response;
      }),
    ).rejects.toThrow();
    await expect(
      capture.recordScenario('text', { method: 'GET', path: '/text' }, (test) => test.expect(200)),
    ).rejects.toThrow(/text.*content-type.*unsupported/);
    await capture.recordScenario('empty', { method: 'GET', path: '/empty' }, (test) =>
      test.expect(204),
    );
    await capture.recordScenario('missing', { method: 'GET', path: '/missing' }, (test) =>
      test.expect(404),
    );
    const scenarios = (await catalog((await capture.flush())!)).scenarios;
    expect(scenarios.map((s) => s.id)).toEqual(['empty', 'missing']);
    expect(scenarios[0].request.body).toBeNull();
    expect(scenarios[0].response).toEqual({ status: 204, body: null });
    expect(scenarios[1].response.status).toBe(404);
  });
  it('rejects unsupported requests and mismatched hints before sending', async () => {
    const capture = recorder();
    for (const body of [undefined, new Date(), Buffer.from('x'), { x: undefined }, NaN]) {
      if (body === undefined) {
        continue;
      }
      await expect(
        capture.recordScenario(
          'bad',
          { method: 'POST', path: '/echo', body: body as Json },
          (test) => test.expect(201),
        ),
      ).rejects.toThrow(/request.body/);
    }
    await expect(
      capture.recordScenario(
        'bad-hint',
        { method: 'POST', path: '/echo', body: { a: 1 } },
        (test) => test.expect(201),
        { requestMatch: { bodyContains: { a: 2 } } },
      ),
    ).rejects.toThrow(/bodyContains/);
    expect(await capture.flush()).toBeUndefined();
    expect(await readdir(directory)).toEqual([]);
  });
  it('snapshots fixtures, rejects pending flush and duplicates, and seals after idempotent flush', async () => {
    const capture = recorder();
    const body = { name: 'before' };
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const recording = capture.recordScenario(
      'one',
      { method: 'POST', path: '/echo', body },
      async (test) => {
        await gate;
        return await test.expect(201).expect({ name: 'before' });
      },
    );
    body.name = 'after';
    await expect(capture.flush()).rejects.toThrow(/Await all/);
    await expect(
      capture.recordScenario('one', { method: 'GET', path: '/empty' }, (test) => test.expect(204)),
    ).rejects.toThrow(/Duplicate/);
    release();
    await recording;
    await expect(
      capture.recordScenario('one', { method: 'GET', path: '/empty' }, (test) => test.expect(204)),
    ).rejects.toThrow(/Duplicate/);
    const paths = await Promise.all([capture.flush(), capture.flush()]);
    expect(paths[0]).toBe(paths[1]);
    expect((await catalog(paths[0]!)).scenarios[0].request.body).toEqual({
      name: 'before',
    });
    await expect(
      capture.recordScenario('two', { method: 'GET', path: '/empty' }, (test) => test.expect(204)),
    ).rejects.toThrow(/closed/);
  });
  it('keeps concurrent same-suite files distinct and produces byte-identical equivalent recordings', async () => {
    const captures = [recorder(), recorder()];
    await Promise.all(
      captures.map((capture) =>
        capture.recordScenario(
          'same',
          { method: 'POST', path: '/echo', body: { b: 2, a: 1 } },
          (test) => test.expect(201),
        ),
      ),
    );
    const paths = await Promise.all(captures.map((capture) => capture.flush()));
    expect(paths[0]).not.toBe(paths[1]);
    expect(await readFile(paths[0]!, 'utf8')).toBe(await readFile(paths[1]!, 'utf8'));
    expect((await readdir(directory)).filter((name) => name.endsWith('.tmp'))).toEqual([]);
    await expect(mergeScenarios(directory)).rejects.toThrow(/Duplicate.*same/);
  });
});
