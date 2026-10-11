import { test, expect } from 'vitest';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createRequire } from 'node:module';

interface ReportSpec {
  title: string;
  file: string;
  line: number;
  tests: {
    annotations: { type: string; description?: string }[];
    results: { attachments: { name: string }[]; errors?: { message: string }[] }[];
  }[];
}
interface ReportSuite {
  specs?: ReportSpec[];
  suites?: ReportSuite[];
}
interface Report {
  stats: { expected: number; unexpected: number; flaky: number; skipped: number };
  suites: ReportSuite[];
  errors?: { message: string }[];
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

test('native fixtures share snapshots across workers and retries while composing with legacy tests', async () => {
  const requests: string[] = [];
  let liveRequests = 0;
  const upstream = createServer((request, response) => {
    response.setHeader('content-type', 'application/json');
    response.setHeader('access-control-allow-origin', '*');
    if (request.url === '/live') {
      liveRequests++;
      response.end(JSON.stringify({ name: 'live' }));
      return;
    }
    requests.push(request.url ?? '');
    const name = request.url?.includes('accounts-api') ? 'accounts' : 'pets';
    const count = requests.filter((url) => url === request.url).length;
    response.end(JSON.stringify(read(count === 1 ? name : 'changed')));
  });
  await new Promise<void>((resolve, reject) => {
    upstream.once('error', reject);
    upstream.listen(0, '127.0.0.1', resolve);
  });
  const address = upstream.address();
  if (!address || typeof address === 'string') throw new Error('Missing test catalog address.');
  const directory = await mkdtemp(join(tmpdir(), 'scenario-client-playwright-'));
  const configPath = join(directory, 'playwright.config.cjs');
  const reportPath = join(directory, 'report.json');
  const cli = join(
    dirname(createRequire(import.meta.url).resolve('playwright/package.json')),
    'cli.js',
  );
  await writeFile(
    configPath,
    `module.exports = ${JSON.stringify({
      testDir: resolve('test/acceptance'),
      testMatch: '**/*.fixture.ts',
      globalSetup: resolve('test/acceptance/global-setup.ts'),
      outputDir: join(directory, 'results'),
      fullyParallel: true,
      workers: 2,
      retries: 1,
      reporter: [['json', { outputFile: reportPath }]],
      use: { baseURL: `http://127.0.0.1:${address.port}`, serviceWorkers: 'block' },
    })};`,
  );
  const run = async (filters: string[] = [], expectedPet = 'pets') => {
    try {
      await promisify(execFile)(
        process.execPath,
        [cli, 'test', '--config', configPath, ...filters],
        {
          env: {
            ...process.env,
            HARNESS_OUTPUT_DIRECTORY: join(directory, 'snapshots'),
            HARNESS_CATALOG_URL: `http://127.0.0.1:${address.port}`,
            HARNESS_EXPECTED_PET: expectedPet,
          },
          timeout: 50_000,
        },
      );
    } catch (error) {
      const output = await readFile(reportPath, 'utf8').catch(() => 'No report generated.');
      if (output === 'No report generated.') throw new Error(output, { cause: error });
      const summary = JSON.parse(output) as Report;
      const failures = [
        ...(summary.errors ?? []).map((failure) => failure.message),
        ...specs(summary.suites).flatMap((spec) =>
          spec.tests.flatMap((entry) =>
            entry.results.flatMap((result) =>
              (result.errors ?? []).map((failure) => `${spec.title}: ${failure.message}`),
            ),
          ),
        ),
      ];
      throw new Error(
        `Playwright acceptance run failed: ${JSON.stringify(summary.stats)}\n${failures.join('\n').slice(0, 5000)}`,
      );
    }
    return JSON.parse(await readFile(reportPath, 'utf8')) as Report;
  };
  try {
    const report = await run();
    expect(report.stats).toMatchObject({ expected: 12, unexpected: 0, flaky: 1, skipped: 1 });
    expect(requests.sort()).toEqual(['/catalogs/accounts-api/main', '/catalogs/petstore-api']);
    expect(liveRequests).toBe(1);
    const collected = specs(report.suites);
    expect(collected).toHaveLength(14);
    for (const spec of collected) {
      expect(spec.file).toBe('catalogs.fixture.ts');
      expect(spec.line).toBeGreaterThan(0);
    }
    const dataOnly = collected.find((spec) => spec.title === 'data-only access')!;
    const untouched = collected.find((spec) => spec.title === 'untouched legacy test')!;
    expect(JSON.stringify(dataOnly)).toContain('catalog-source');
    expect(JSON.stringify(dataOnly)).not.toContain('catalog-requests');
    expect(JSON.stringify(dataOnly)).not.toContain('existing-page-fixture');
    expect(JSON.stringify(untouched)).not.toContain('catalog-source');
    expect(JSON.stringify(untouched)).not.toContain('catalog-requests');
    expect(JSON.stringify(untouched)).not.toContain('existing-page-fixture');
    expect(JSON.stringify(report.suites)).toContain('Unknown petstore-api scenario ID: unknown');
    expect(JSON.stringify(report.suites)).toContain('requires use.serviceWorkers');
    expect(JSON.stringify(report.suites)).not.toContain('The next action must not run');
    const skipped = collected.find((spec) => spec.title === 'skipped native test')!;
    const filtered = await run([`catalogs.fixture.ts:${skipped.line}`]);
    expect(filtered.stats).toMatchObject({ expected: 0, unexpected: 0, skipped: 1 });
    expect(specs(filtered.suites).map((spec) => spec.title)).toEqual([skipped.title]);
    expect(requests).toHaveLength(2);
    // A new run fetches fresh data; the same source then sees upstream's next version.
    const fresh = await run(['--grep', 'data-only access$'], 'changed');
    expect(fresh.stats.unexpected).toBe(0);
    expect(requests.filter((url) => url === '/catalogs/petstore-api')).toHaveLength(2);
  } finally {
    await new Promise<void>((resolve, reject) => {
      upstream.close((error) => (error ? reject(error) : resolve()));
      upstream.closeIdleConnections();
    });
    await rm(directory, { recursive: true, force: true });
  }
});
