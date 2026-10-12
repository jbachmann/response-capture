import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { expect, it, vi, beforeEach } from 'vitest';
import {
  getContractCatalog,
  contractGlobalSetup,
} from '@response-capture/scenario-contract/vitest';
import { fixtureCatalog, fixtureSnapshot } from './fixtures.js';

const { context } = vi.hoisted(() => ({ context: vi.fn() }));
vi.mock('vitest', async (importOriginal) => ({
  ...(await importOriginal<typeof import('vitest')>()),
  inject: context,
}));
beforeEach(() => {
  context.mockReset();
});

it('requires setup and rejects undeclared aliases including inherited property names', () => {
  expect(() => getContractCatalog('widgets')).toThrow('contractGlobalSetup');
  context.mockReturnValue({ widgets: fixtureSnapshot() });
  expect(() => getContractCatalog('missing')).toThrow(/Unknown.*missing.*widgets/);
  expect(() => getContractCatalog('toString')).toThrow('Unknown');
});
it('looks up named catalog copies without mutating the provided context', () => {
  const snapshot = fixtureSnapshot();
  context.mockReturnValue({ widgets: snapshot });
  const copy = getContractCatalog('widgets');
  copy.catalog.scenarios.length = 0;
  copy.source.sha256 = 'changed';
  expect(getContractCatalog('widgets')).toEqual(snapshot);
  expect(context).toHaveBeenCalledWith('scenarioContractCatalogs');
});
it('loads once per source across aliases and actual Vitest workers', async () => {
  let requests = 0;
  const server = createServer((request, response) => {
    requests++;
    response.setHeader('content-type', 'application/json');
    if (request.url !== '/catalogs/widgets-api/feature%2Fbranch') {
      response.writeHead(404).end('{}');
      return;
    }
    // A second lookup would receive an incompatible snapshot.
    response.end(
      JSON.stringify(requests === 1 ? fixtureCatalog() : { catalogVersion: 1, scenarios: [] }),
    );
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const directory = await mkdtemp(join(tmpdir(), 'contract-vitest-'));
  try {
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Missing fixture address');
    const require = createRequire(import.meta.url);
    const vitestRoot = dirname(require.resolve('vitest/package.json'));
    const importPath = (path: string) => JSON.stringify(pathToFileURL(path).href);
    const adapter = importPath(require.resolve('@response-capture/scenario-contract/vitest'));
    const core = importPath(require.resolve('@response-capture/scenario-contract'));
    const source = {
      systemName: 'widgets-api',
      catalogApiUrl: `http://127.0.0.1:${address.port}`,
      selection: { selector: 'feature/branch' },
    };
    await writeFile(
      join(directory, 'setup.mjs'),
      `import { contractGlobalSetup } from ${adapter}; export default contractGlobalSetup(${JSON.stringify({ catalogs: { widgets: source, alias: source }, rootDirectory: directory, outputDirectory: 'results' })});`,
    );
    await writeFile(
      join(directory, 'vitest.config.mjs'),
      `export default { test: { include: ['*.test.ts'], globalSetup: ['./setup.mjs'], maxWorkers: 2 } };`,
    );
    for (const alias of ['widgets', 'alias']) {
      await writeFile(
        join(directory, `${alias}.test.ts`),
        `
        import { it, expect } from ${importPath(join(vitestRoot, 'dist/index.js'))};
        import { z } from ${importPath(require.resolve('zod'))};
        import { getContractCatalog } from ${adapter};
        import { assertScenarioContract } from ${core};
        it('uses ${alias} and keeps the shared snapshot intact', () => {
          const snapshot = getContractCatalog('${alias}');
          assertScenarioContract(snapshot, 'widget.read', { response: z.looseObject({ status: z.literal(200) }) });
          snapshot.catalog.scenarios.length = 0;
          expect(getContractCatalog('${alias}').catalog.scenarios).toHaveLength(1);
          expect(() => getContractCatalog('missing')).toThrow('Unknown contract catalog alias');
        });
      `,
      );
    }
    const execute = promisify(execFile);
    const { stdout } = await execute(
      process.execPath,
      [
        join(vitestRoot, 'vitest.mjs'),
        'run',
        '--root',
        directory,
        '--config',
        join(directory, 'vitest.config.mjs'),
      ],
      { timeout: 20_000 },
    );
    expect(stdout).toContain('2 passed');
    expect(requests).toBe(1);
    // The factory is composable with an application's existing global setup.
    const provided = vi.fn();
    await writeFile(join(directory, 'widgets.json'), JSON.stringify(fixtureCatalog()));
    await contractGlobalSetup({
      catalogs: { widgets: { systemName: 'widgets-api', file: 'widgets.json' } },
      rootDirectory: directory,
      outputDirectory: 'results',
    })({ provide: provided });
    expect(provided).toHaveBeenCalledWith(
      'scenarioContractCatalogs',
      expect.objectContaining({ widgets: expect.any(Object) }),
    );
    const badSetup = contractGlobalSetup({
      catalogs: { widgets: { systemName: 'widgets-api', file: 'missing.json' } },
      rootDirectory: directory,
      outputDirectory: 'results',
    });
    await expect(badSetup({ provide: provided })).rejects.toThrow('ENOENT');
    expect(provided).toHaveBeenCalledTimes(1);
    // Loading errors fail the runner before any test can use a fallback snapshot.
    await writeFile(
      join(directory, 'setup.mjs'),
      `import { contractGlobalSetup } from ${adapter}; export default contractGlobalSetup(${JSON.stringify({ catalogs: { widgets: { systemName: 'widgets-api', file: 'missing.json' } }, rootDirectory: directory, outputDirectory: 'results' })});`,
    );
    await expect(
      execute(
        process.execPath,
        [
          join(vitestRoot, 'vitest.mjs'),
          'run',
          '--root',
          directory,
          '--config',
          join(directory, 'vitest.config.mjs'),
        ],
        { timeout: 20_000 },
      ),
    ).rejects.toMatchObject({ code: 1, stderr: expect.stringContaining('missing.json') });
    expect(await readFile(join(directory, 'widgets.json'), 'utf8')).toContain('widget.read');
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    await rm(directory, { recursive: true, force: true });
  }
});
