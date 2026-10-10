import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, join, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { test, expect } from '@playwright/test';
import { startSnapshotLoader, loadSnapshot } from './support/snapshot-loader';
import { resolveRouting } from './support/systems';
import { catalogSelectionFromEnv, fetchCatalog } from './support/catalog';

interface ReportSpec {
  title: string;
  file: string;
  line: number;
  tests: { annotations: { type: string; description?: string }[] }[];
}
interface ReportSuite {
  specs?: ReportSpec[];
  suites?: ReportSuite[];
}
function specs(suites: ReportSuite[]): ReportSpec[] {
  return suites.flatMap((suite) => [...(suite.specs ?? []), ...specs(suite.suites ?? [])]);
}

const read = (name: string) => ({
  catalogVersion: 1,
  scenarios: [
    {
      schemaVersion: 1,
      id: 'read',
      request: { method: 'GET', path: '/pet/1', body: null },
      response: { status: 200, body: { name } },
    },
  ],
});

test('resolve registry bindings, overrides, and unknown-system diagnostics', () => {
  const source = { systemName: 'petstore-api', selection: { latest: true } } as const;
  expect(resolveRouting(source, 'http://localhost:4202')).toEqual({
    origin: 'http://localhost:4202',
    pathPrefix: '',
    protectedPaths: ['/pet', '/store', '/training'],
  });
  expect(() => resolveRouting({ ...source, systemName: 'accounts-api' }, 'http://ui.test')).toThrow(
    'Register it in support/systems.ts',
  );
  expect(
    resolveRouting(
      {
        ...source,
        systemName: 'accounts-api',
        routing: { origin: 'http://accounts.test', pathPrefix: '/v1/', protectedPaths: ['/'] },
      },
      'http://ui.test',
    ).pathPrefix,
  ).toBe('/v1');
  expect(() =>
    resolveRouting(
      { ...source, routing: { origin: 'http://accounts.test/v1', protectedPaths: ['/'] } },
      'http://ui.test',
    ),
  ).toThrow('origin');
});

test('encode system names and select explicit catalogs independently of environment defaults', async () => {
  let requested = '';
  const snapshot = await fetchCatalog(
    'http://catalog.test',
    { systemName: 'accounts/api', selection: { selector: 'feature/login' } },
    async (url) => {
      requested = String(url);
      return Response.json(read('account'));
    },
  );
  expect(requested).toBe('http://catalog.test/catalogs/accounts%2Fapi/feature%2Flogin');
  expect(snapshot.source.systemName).toBe('accounts/api');
  expect(catalogSelectionFromEnv('  ')).toEqual({ latest: true });
  await expect(
    fetchCatalog('http://catalog.test', { systemName: 'accounts', selection: { selector: '' } }),
  ).rejects.toThrow('nonblank');
});

test('share in-flight snapshots, freeze latest, and memoize failures', async ({}, testInfo) => {
  let fetches = 0;
  const loader = await startSnapshotLoader(testInfo.outputPath('snapshots'), async (url) => {
    fetches++;
    if (String(url).includes('invalid')) return Response.json({ catalogVersion: 2 });
    return Response.json(read(`version-${fetches}`));
  });
  try {
    const source = {
      systemName: 'accounts-api',
      catalogApiUrl: 'http://catalog.test',
      selection: { latest: true },
    } as const;
    const loaded = await Promise.all(Array.from({ length: 8 }, () => loadSnapshot(source, loader)));
    expect(fetches).toBe(1);
    expect(new Set(loaded.map((item) => item.path)).size).toBe(1);
    expect((await loadSnapshot(source, loader)).snapshot).toEqual(loaded[0].snapshot);
    const pinned = await loadSnapshot({ ...source, selection: { selector: 'main' } }, loader);
    expect(pinned.path).not.toBe(loaded[0].path);
    expect(fetches).toBe(2);
    for (let attempt = 0; attempt < 2; attempt++) {
      await expect(loadSnapshot({ ...source, systemName: 'invalid' }, loader)).rejects.toThrow(
        'catalogVersion',
      );
    }
    expect(fetches).toBe(3);
    const forbidden = await fetch(loader.url, { method: 'POST', body: '{}' });
    expect(forbidden.status).toBe(403);
    const tampered = loaded[0].snapshot;
    tampered.catalog.scenarios = [];
    await writeFile(loaded[0].path, JSON.stringify(tampered));
    await expect(loadSnapshot(source, loader)).rejects.toThrow('digest');
  } finally {
    await loader.close();
  }
});

test('declarations activate before hooks and share catalogs across real workers and retries', async ({}, testInfo) => {
  test.setTimeout(60_000);
  const requests: string[] = [];
  const upstream = createServer((request, response) => {
    requests.push(request.url ?? '');
    const name = request.url?.includes('accounts-api') ? 'accounts' : 'pets';
    // A second fetch would return changed data, exposing snapshot regressions.
    const count = requests.filter((url) => url === request.url).length;
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify(read(count === 1 ? name : 'changed')));
  });
  await new Promise<void>((resolve) => upstream.listen(0, '127.0.0.1', resolve));
  const address = upstream.address();
  if (!address || typeof address === 'string') throw new Error('Missing test catalog address.');
  const directory = testInfo.outputPath('nested-run');
  await mkdir(directory, { recursive: true });
  const configPath = join(directory, 'playwright.config.ts');
  const reportPath = join(directory, 'report.json');
  await writeFile(
    configPath,
    `export default ${JSON.stringify({
      testDir: resolve(__dirname, 'acceptance'),
      testMatch: '**/*.fixture.ts',
      globalSetup: resolve(__dirname, 'global-setup.ts'),
      outputDir: join(directory, 'results'),
      fullyParallel: true,
      workers: 2,
      retries: 1,
      reporter: [['json', { outputFile: reportPath }]],
      use: { baseURL: 'http://localhost:4202', serviceWorkers: 'block' },
    })};`,
  );
  try {
    await promisify(execFile)(
      process.execPath,
      [
        join(dirname(require.resolve('playwright/package.json')), 'cli.js'),
        'test',
        '--config',
        configPath,
      ],
      {
        env: {
          ...process.env,
          PETSTORE_E2E_RUN_DIR: join(directory, 'snapshots'),
          HARNESS_CATALOG_URL: `http://127.0.0.1:${address.port}`,
          CATALOG_SELECTOR: 'ignored-by-explicit-selections',
        },
        timeout: 50_000,
      },
    );
    const report = JSON.parse(await readFile(reportPath, 'utf8')) as {
      stats: { expected: number; unexpected: number; flaky: number; skipped: number };
      suites: ReportSuite[];
    };
    expect(report.stats).toMatchObject({ expected: 5, unexpected: 0, flaky: 1, skipped: 1 });
    expect(requests.sort()).toEqual(['/catalogs/accounts-api/main', '/catalogs/petstore-api']);
    // Verify source metadata is present in the collected test report, including skipped tests.
    const collected = specs(report.suites);
    expect(collected).toHaveLength(7);
    for (const spec of collected) {
      expect(spec.file).toBe('catalogs.fixture.ts');
      expect(spec.line).toBeGreaterThan(0);
    }
    const skipped = collected.find((spec) => spec.title.startsWith('skipped declarations'));
    const annotation = skipped?.tests[0].annotations.find(
      (entry) => entry.type === 'catalog-declaration',
    );
    expect(JSON.parse(annotation?.description ?? '{}')).toMatchObject({
      catalogs: { accounts: { systemName: 'accounts-api', selection: { selector: 'main' } } },
    });
    expect(JSON.stringify(report.suites)).toContain('Unknown petstore-api scenario ID: unknown');
    expect(JSON.stringify(report.suites)).not.toContain('The callback must not run');
    await testInfo.attach('declaration-acceptance-report', {
      path: reportPath,
      contentType: 'application/json',
    });
    // File:line selection must point to the authoring file, not the wrapper.
    await promisify(execFile)(
      process.execPath,
      [
        join(dirname(require.resolve('playwright/package.json')), 'cli.js'),
        'test',
        '--config',
        configPath,
        `catalogs.fixture.ts:${skipped!.line}`,
      ],
      {
        env: {
          ...process.env,
          PETSTORE_E2E_RUN_DIR: join(directory, 'filtered-snapshots'),
          HARNESS_CATALOG_URL: `http://127.0.0.1:${address.port}`,
        },
        timeout: 15_000,
      },
    );
    const filtered = JSON.parse(await readFile(reportPath, 'utf8')) as {
      stats: { expected: number; unexpected: number; skipped: number };
      suites: ReportSuite[];
    };
    expect(filtered.stats).toMatchObject({ expected: 0, unexpected: 0, skipped: 1 });
    expect(specs(filtered.suites).map((spec) => spec.title)).toEqual([skipped!.title]);
    expect(requests).toHaveLength(2);
  } finally {
    await new Promise<void>((resolve, reject) => {
      upstream.close((error) => (error ? reject(error) : resolve()));
      upstream.closeIdleConnections();
    });
  }
});
