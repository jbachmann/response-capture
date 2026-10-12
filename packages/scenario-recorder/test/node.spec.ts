import { createServer } from 'node:http';
import { gzipSync } from 'node:zlib';
import request from 'supertest';
import { CaptureSession } from '../src/index.js';
import { startHttpCapture, withCaptureSession } from '../src/node.js';
import { capture } from '../src/supertest.js';

let retryAttempts = 0;
const app = createServer(async (req, res) => {
  let text = '';
  for await (const chunk of req) text += chunk;
  if (req.url === '/retry' && ++retryAttempts === 1) {
    res.writeHead(503, { 'content-type': 'application/json' });
    res.end('{"retry":true}');
    return;
  }
  if (req.url === '/redirect') {
    res.writeHead(302, { location: '/echo' });
    res.end();
    return;
  }
  if (req.url === '/empty') {
    res.writeHead(204);
    res.end();
    return;
  }
  if (req.url === '/missing') {
    res.writeHead(404, { 'content-type': 'application/problem+json' });
    res.end('{"error":"missing"}');
    return;
  }
  if (req.url === '/text') {
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end('hello');
    return;
  }
  if (req.url === '/bad-json') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end('{');
    return;
  }
  if (req.url === '/gzip') {
    res.writeHead(200, { 'content-type': 'application/json', 'content-encoding': 'gzip' });
    res.end(gzipSync('{"gzip":true}'));
    return;
  }
  res.writeHead(201, { 'content-type': 'application/json' });
  res.end(text || 'null');
});

let stop: () => void;
beforeAll(() => {
  stop = startHttpCapture();
});
afterAll(async () => {
  stop();
  if (app.listening) await new Promise<void>((resolve) => app.close(() => resolve()));
});

it('observes serialized JSON, snapshots before assertions mutate bodies, and ignores unmarked requests', async () => {
  const session = new CaptureSession();
  await withCaptureSession(session, async () => {
    await request(app)
      .post('/echo')
      .send({ a: 1 })
      .send({ b: 2 })
      .use(capture('merged'))
      .expect(201);
    await request(app)
      .post('/echo')
      .send({ before: true })
      .serialize(() => '{"actual":true}')
      .use(capture('serialized'))
      .expect(201)
      .expect({ actual: true });
    for (const [index, body] of [
      { nested: { x: 1 } },
      [1, { x: true }],
      'hello',
      42,
      false,
      null,
    ].entries()) {
      const observed = await request(app)
        .post('/echo')
        .type('json')
        .send(JSON.stringify(body))
        .use(capture(`value.${index}`))
        .expect(201);
      if (index === 0) observed.body.nested.x = 99;
    }
    await request(app).get('/empty').use(capture('empty')).expect(204);
    await request(app).get('/missing').use(capture('missing')).expect(404);
    await request(app).post('/echo').send({ unmarked: true }).expect(201);
  });
  const scenarios = session.finish();
  expect(scenarios).toHaveLength(10);
  expect(scenarios.find((s) => s.id === 'merged')?.request.body).toEqual({ a: 1, b: 2 });
  expect(scenarios.find((s) => s.id === 'serialized')?.request.body).toEqual({ actual: true });
  expect(scenarios.find((s) => s.id === 'value.0')?.response.body).toEqual({ nested: { x: 1 } });
  expect(scenarios.find((s) => s.id === 'value.4')?.response.body).toBe(false);
  expect(scenarios.find((s) => s.id === 'empty')?.response.body).toBeNull();
  expect(scenarios.find((s) => s.id === 'missing')?.response.status).toBe(404);
});

it.each([
  ['/text', /content-type/],
  ['/gzip', /compressed/],
  ['/redirect', /redirects|multiple HTTP/],
] as const)(
  'buffers capture errors without changing the native response: %s',
  async (path, error) => {
    const session = new CaptureSession();
    await withCaptureSession(session, async () => {
      const test = request(app).get(path).use(capture('unsupported'));
      if (path === '/redirect') test.redirects(1);
      const response = await test.expect(
        path === '/redirect' ? 201 : path.startsWith('/echo') ? 201 : 200,
      );
      expect(response.status).not.toBe(500);
    });
    expect(() => session.finish()).toThrow(error);
  },
);

it('captures decoded query values in repeated-key order and omits query for queryless requests', async () => {
  const session = new CaptureSession();
  await withCaptureSession(session, async () => {
    await request(app)
      .get('/echo?tags=cute%20cat&tags=a%2Bb&empty=&bare&__proto__=safe&tags=last+tag')
      .use(capture('query'))
      .expect(201);
    await request(app).get('/echo').use(capture('queryless')).expect(201);
  });
  expect(session.finish().map((scenario) => scenario.request)).toEqual([
    {
      method: 'GET',
      path: '/echo',
      body: null,
      query: {
        tags: ['cute cat', 'a+b', 'last tag'],
        empty: [''],
        bare: [''],
        ['__proto__']: ['safe'],
      },
    },
    { method: 'GET', path: '/echo', body: null },
  ]);
});

it('isolates concurrent sessions and snapshots metadata at the marker', async () => {
  const sessions = await Promise.all(
    ['first', 'second'].map(async (id) => {
      const session = new CaptureSession();
      await withCaptureSession(session, async () => {
        const metadata = { tags: [id] };
        const test = request(app).post('/echo').send({ id }).use(capture(id, metadata));
        metadata.tags.push('mutated');
        await test.expect(201);
      });
      return session.finish();
    }),
  );
  expect(sessions.map((s) => [s[0].id, s[0].tags, s[0].request.body])).toEqual([
    ['first', ['first'], { id: 'first' }],
    ['second', ['second'], { id: 'second' }],
  ]);
});

it('leaves markers inert outside a capture session, even for non-JSON responses', async () => {
  await request(app)
    .get('/text')
    .use(capture('', { title: ' ' }))
    .expect(200)
    .expect('hello');
});

it('rejects actual HTTP retries and caught Supertest expectation failures', async () => {
  const retried = new CaptureSession();
  await withCaptureSession(retried, async () => {
    await request(app).get('/retry').use(capture('retried')).retry(1).expect(201);
  });
  expect(() => retried.finish()).toThrow(/retries|multiple HTTP/);
  const rejected = new CaptureSession();
  await withCaptureSession(rejected, async () => {
    await expect(request(app).get('/echo').use(capture('rejected')).expect(400)).rejects.toThrow(
      /expected 400/,
    );
  });
  expect(() => rejected.finish()).toThrow(/expected 400/);
});

it('rejects streamed requests and explicitly unbuffered responses', async () => {
  const unbuffered = new CaptureSession();
  await withCaptureSession(unbuffered, async () => {
    await request(app).get('/echo').use(capture('stream')).buffer(false).expect(201);
  });
  expect(() => unbuffered.finish()).toThrow(/unbuffered|buffer\(false\)/);
  const streamed = new CaptureSession();
  // Streaming starts the connection before .end(); use an already listening server.
  if (!app.listening) await new Promise<void>((resolve) => app.listen(0, '127.0.0.1', resolve));
  await withCaptureSession(streamed, async () => {
    const test = request(app).post('/echo').type('json').use(capture('streamed'));
    test.write('{"stream":true}');
    await test.expect(201);
  });
  expect(() => streamed.finish()).toThrow(/write\(\)|streaming/);
});
