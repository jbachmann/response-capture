import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { readCatalogSnapshot } from '@response-capture/scenario-client/node';
import { assertCatalogContract } from './assert-contract';
import { fixtureCatalog } from './fixtures';
import { loadContractCatalog, prepareContractRun } from './load-catalog';

let directory: string;
let filename: string;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'petstore-contract-'));
  filename = join(directory, 'catalog.json');
  await writeFile(filename, JSON.stringify(fixtureCatalog()));
});
afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

it('gives raw file input precedence, resolves from the workspace, and does no network lookup', async () => {
  const fetcher = vi.fn<typeof fetch>();
  const snapshot = await loadContractCatalog(
    directory,
    {
      CONTRACT_CATALOG_PATH: 'catalog.json',
      CATALOG_API_URL: 'invalid',
      CATALOG_SELECTOR: 'ignored',
    },
    fetcher,
  );
  expect(fetcher).not.toHaveBeenCalled();
  expect(snapshot.source.url).toContain(filename);
  expect(snapshot.source.selector).toBeNull();
  assertCatalogContract(snapshot);
});
it.each([
  ['bad.json', '{', 'JSON'],
  ['shape.json', '{"catalogVersion":2,"scenarios":[]}', 'catalogVersion'],
  ['missing.json', undefined, 'ENOENT'],
] as const)('fails file loading for %s without falling back', async (name, content, error) => {
  if (content !== undefined) await writeFile(join(directory, name), content);
  const fetcher = vi.fn<typeof fetch>();
  await expect(
    loadContractCatalog(directory, { CONTRACT_CATALOG_PATH: name }, fetcher),
  ).rejects.toThrow(error);
  expect(fetcher).not.toHaveBeenCalled();
});
it('rejects explicitly blank file input', async () => {
  const fetcher = vi.fn<typeof fetch>();
  await expect(
    loadContractCatalog(directory, { CONTRACT_CATALOG_PATH: '' }, fetcher),
  ).rejects.toThrow('CONTRACT_CATALOG_PATH');
  expect(fetcher).not.toHaveBeenCalled();
});
it.each([
  [{}, 'http://localhost:3001/catalogs/petstore-api', null],
  [{ CATALOG_SELECTOR: '' }, 'http://localhost:3001/catalogs/petstore-api', null],
  [{ CATALOG_SELECTOR: ' ' }, 'http://localhost:3001/catalogs/petstore-api', null],
  [
    { CATALOG_API_URL: 'https://catalog.example/base/' },
    'https://catalog.example/base/catalogs/petstore-api',
    null,
  ],
  [
    { CATALOG_API_URL: 'https://catalog.example', CATALOG_SELECTOR: 'feature/a b' },
    'https://catalog.example/catalogs/petstore-api/feature%2Fa%20b',
    'feature/a b',
  ],
  [{ CATALOG_SELECTOR: 'abc123' }, 'http://localhost:3001/catalogs/petstore-api/abc123', 'abc123'],
] as const)('handles latest and selector sources %j', async (env, url, selector) => {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValue(new Response(JSON.stringify(fixtureCatalog())));
  const snapshot = await loadContractCatalog(directory, env, fetcher);
  expect(fetcher).toHaveBeenCalledExactlyOnceWith(
    url,
    expect.objectContaining({ signal: expect.any(AbortSignal) }),
  );
  expect(snapshot.source.selector).toBe(selector);
});
it.each([
  ['HTTP 404', () => Promise.resolve(new Response('missing catalog', { status: 404 }))],
  ['offline', () => Promise.reject(new Error('offline'))],
  ['JSON', () => Promise.resolve(new Response('{'))],
  ['catalogVersion', () => Promise.resolve(new Response('{"catalogVersion":2,"scenarios":[]}'))],
] as const)(
  'fails unavailable or malformed network catalogs: %s',
  async (message, implementation) => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(implementation);
    await expect(loadContractCatalog(directory, {}, fetcher)).rejects.toThrow(message);
    expect(fetcher).toHaveBeenCalledTimes(1);
  },
);
it('writes unique run snapshots and source metadata with verified digests', async () => {
  const env = { CONTRACT_CATALOG_PATH: filename };
  const first = await prepareContractRun(directory, env);
  const second = await prepareContractRun(directory, env);
  expect(first.directory).not.toBe(second.directory);
  expect(first.directory).toContain(join('test-results', 'contract'));
  expect(await readCatalogSnapshot(join(first.directory, 'snapshot.json'))).toEqual(first.snapshot);
  expect(JSON.parse(await readFile(join(first.directory, 'source.json'), 'utf8'))).toEqual(
    first.snapshot.source,
  );
});
it('loads once in global setup and shares the same snapshot across the actual contract suite', async () => {
  let requests = 0;
  const catalog = fixtureCatalog();
  const server = createServer((request, response) => {
    requests++;
    expect(request.url).toBe('/catalogs/petstore-api/feature%2Fbranch');
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify(catalog));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Missing server address');
    const workspace = fileURLToPath(new URL('../', import.meta.url));
    const require = createRequire(import.meta.url);
    const runner = join(dirname(require.resolve('vitest/package.json')), 'vitest.mjs');
    const execute = promisify(execFile);
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      CATALOG_API_URL: `http://127.0.0.1:${address.port}`,
      CATALOG_SELECTOR: 'feature/branch',
    };
    delete env['CONTRACT_CATALOG_PATH'];
    const { stdout } = await execute(
      process.execPath,
      [runner, 'run', '--config', 'contract/vitest.config.ts'],
      { cwd: workspace, env, timeout: 20_000 },
    );
    expect(stdout).toContain('30 passed');
    expect(requests).toBe(1);
    // Changing provider state cannot alter the already provided run snapshot.
    catalog.scenarios.length = 0;
    const fileRun = await execute(
      process.execPath,
      [runner, 'run', '--config', 'contract/vitest.config.ts'],
      {
        cwd: workspace,
        env: { ...env, CONTRACT_CATALOG_PATH: relative(workspace, filename) },
        timeout: 20_000,
      },
    );
    expect(fileRun.stdout).toContain('30 passed');
    expect(requests).toBe(1);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}, 45_000);
