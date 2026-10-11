import { execFile } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execute = promisify(execFile);
const require = createRequire(import.meta.url);
const vitestRoot = dirname(require.resolve('vitest/package.json'));
const vitestModule = join(vitestRoot, 'dist/index.js');
const recorder = fileURLToPath(new URL('../dist/', import.meta.url));
const moduleUrl = (path: string) => JSON.stringify(pathToFileURL(path).href);
let directory: string;
const previous = 'previous catalog must survive failure\n';
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const captureDirectories = async () =>
  (await readdir(directory, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && uuidPattern.test(entry.name))
    .map((entry) => entry.name);

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'scenario-vitest-'));
  await writeFile(join(directory, 'catalog.json'), previous);
});
afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

async function run(body: string, options: { enabled?: boolean; secondFile?: string } = {}) {
  const setup = `
import { it, expect, afterAll, afterEach } from ${moduleUrl(vitestModule)};
import request from ${moduleUrl(require.resolve('supertest'))};
import { createServer } from 'node:http';
import { capture } from ${moduleUrl(join(recorder, 'supertest.js'))};
let attempt = 0;
const app = createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ path: req.url }));
});
afterAll(async () => { if (app.listening) await new Promise(resolve => app.close(resolve)); });
const api = (id) => request(app).get('/example').use(capture(id)).expect(200);
`;
  await writeFile(join(directory, 'capture.test.ts'), setup + body);
  if (options.secondFile)
    await writeFile(join(directory, 'other.test.ts'), setup + options.secondFile);
  const config = `
import { scenarioCapture } from ${moduleUrl(join(recorder, 'vitest.js'))};
export default { test: {
  include: ['*.test.ts'], testTimeout: 2000, hookTimeout: 2000,
  ${options.enabled === false ? '' : `...scenarioCapture({outputDirectory: ${JSON.stringify(directory)}})`}
}};
`;
  await writeFile(join(directory, 'vitest.config.mjs'), config);
  try {
    const result = await execute(
      process.execPath,
      [
        join(vitestRoot, 'vitest.mjs'),
        'run',
        '--root',
        directory,
        '--config',
        join(directory, 'vitest.config.mjs'),
      ],
      {
        cwd: resolve('.'),
        timeout: 20_000,
        env: { ...process.env, NO_COLOR: '1' },
      },
    );
    return { code: 0, output: result.stdout + result.stderr };
  } catch (error) {
    const result = error as { code: number; stdout: string; stderr: string };
    if (typeof result.code !== 'number') throw error;
    return { code: result.code, output: result.stdout + result.stderr };
  }
}

it('ordinary test runs leave markers inert and the catalog untouched', async () => {
  const result = await run(`it('ordinary', async () => { await api('one'); });`, {
    enabled: false,
  });
  expect(result.code, result.output).toBe(0);
  expect(await readFile(join(directory, 'catalog.json'), 'utf8')).toBe(previous);
  expect(await captureDirectories()).toEqual([]);
});

it('publishes only the current successful run across concurrent tests and parallel workers', async () => {
  await writeFile(join(directory, 'stale.scenarios.json'), '{invalid stale recording');
  const result = await run(
    `
it.concurrent('one', async () => { await api('one'); });
it.concurrent('two', async () => { await api('two'); });
it.skip('skipped', async () => { await api('skipped'); });
it.fails('expected failure', async () => { await api('expected'); expect(false).toBe(true); });
it('dynamic skip', async ({ skip }) => { await api('dynamic'); skip(); });
it('retry', { retry: 1 }, async () => { if (attempt === 0) await api('failed-attempt'); await api('retry'); expect(++attempt).toBe(2); });
`,
    { secondFile: `it('worker', async () => { await api('worker'); });` },
  );
  expect(result.code, result.output).toBe(0);
  const first = await readFile(join(directory, 'catalog.json'), 'utf8');
  const firstDirectories = await captureDirectories();
  expect(firstDirectories).toHaveLength(1);
  expect(await readFile(join(directory, firstDirectories[0], 'catalog.json'), 'utf8')).toBe(first);
  expect(JSON.parse(first).scenarios.map((s: { id: string }) => s.id)).toEqual([
    'one',
    'retry',
    'two',
    'worker',
  ]);
  const again = await run(
    `
it.concurrent('two', async () => { await api('two'); });
it.concurrent('one', async () => { await api('one'); });
it('retry', async () => { await api('retry'); });
`,
    { secondFile: `it('worker', async () => { await api('worker'); });` },
  );
  expect(again.code, again.output).toBe(0);
  expect(await readFile(join(directory, 'catalog.json'), 'utf8')).toBe(first);
  const secondDirectories = await captureDirectories();
  expect(secondDirectories).toHaveLength(2);
  expect(secondDirectories).toContain(firstDirectories[0]);
  for (const group of secondDirectories) {
    expect(await readdir(join(directory, group))).toEqual(['catalog.json']);
    expect(await readFile(join(directory, group, 'catalog.json'), 'utf8')).toBe(first);
  }
});

it.each([
  ['later assertion', `it('late', async () => { await api('one'); expect(false).toBe(true); });`],
  [
    'Supertest expectation',
    `it('rejected', async () => { await request(app).get('/example').use(capture('one')).expect(201); });`,
  ],
  [
    'afterEach',
    `afterEach(() => { throw new Error('teardown failed'); }); it('one', async () => { await api('one'); });`,
  ],
  [
    'afterAll',
    `afterAll(() => { throw new Error('suite teardown failed'); }); it('one', async () => { await api('one'); });`,
  ],
  [
    'finished hook',
    `it('one', async ({ onTestFinished }) => { onTestFinished(() => { throw new Error('finished failed'); }); await api('one'); });`,
  ],
  [
    'outer aroundEach',
    `import { aroundEach } from ${moduleUrl(vitestModule)}; aroundEach(async runTest => { await runTest(); throw new Error('outer teardown failed'); }); it('one', async () => { await api('one'); });`,
  ],
  [
    'capture validation',
    `it('query', async () => { await request(app).get('/example?query=1').use(capture('one')).expect(200); });`,
  ],
  [
    'caught capture validation',
    `it('invalid metadata', () => { try { request(app).get('/example').use(capture('one', { title: ' ' })); } catch {} });`,
  ],
  [
    'duplicate IDs across tests',
    `it('one', async () => { await api('same'); }); it('two', async () => { await api('same'); });`,
  ],
  ['unawaited request', `it('unawaited', () => { api('one'); });`],
  [
    'timeout',
    `it('timeout', async () => { await api('one'); await new Promise(resolve => setTimeout(resolve, 100)); }, 50);`,
  ],
  [
    'unhandled error',
    `it('one', async () => { await api('one'); queueMicrotask(() => { throw new Error('unhandled capture run error'); }); });`,
  ],
] as const)('preserves the previous catalog when the run fails: %s', async (_name, body) => {
  const result = await run(body);
  expect(result.code, result.output).not.toBe(0);
  expect(await readFile(join(directory, 'catalog.json'), 'utf8')).toBe(previous);
  expect(await captureDirectories()).toEqual([]);
});

it('makes publication failures fail the command', async () => {
  await rm(join(directory, 'catalog.json'));
  const { mkdir } = await import('node:fs/promises');
  await mkdir(join(directory, 'catalog.json'));
  const result = await run(`it('one', async () => { await api('one'); });`);
  expect(result.code, result.output).not.toBe(0);
  expect(result.output).toMatch(/EISDIR|directory/);
  expect(await captureDirectories()).toEqual([]);
});
