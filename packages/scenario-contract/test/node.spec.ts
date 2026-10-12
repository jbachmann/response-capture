import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { readCatalogSnapshot } from '@response-capture/scenario-client/node';
import {
  loadContractCatalog,
  prepareContractRun,
  type ContractCatalogSource,
} from '@response-capture/scenario-contract/node';
import { fixtureCatalog } from './fixtures.js';

let directory: string;
const systemName = 'widgets-api';
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'scenario-contract-'));
  await writeFile(join(directory, 'widgets.json'), JSON.stringify(fixtureCatalog()));
});
afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

it('reads a raw catalog relative to the configured root without networking', async () => {
  const fetcher = vi.fn<typeof fetch>();
  const snapshot = await loadContractCatalog(
    { systemName, file: 'widgets.json' },
    { rootDirectory: directory, fetcher },
  );
  expect(snapshot.catalog).toEqual(fixtureCatalog());
  expect(snapshot.source.url).toContain(join(directory, 'widgets.json'));
  expect(snapshot.source.systemName).toBe(systemName);
  expect(fetcher).not.toHaveBeenCalled();
});
it('defaults relative paths to the working directory', async () => {
  const snapshot = await loadContractCatalog({
    systemName,
    file: relative(process.cwd(), join(directory, 'widgets.json')),
  });
  expect(snapshot.catalog).toEqual(fixtureCatalog());
});
it.each([
  ['missing.json', undefined, 'ENOENT'],
  ['malformed.json', '{', 'JSON'],
  ['invalid.json', '{"catalogVersion":2,"scenarios":[]}', 'catalogVersion'],
] as const)('fails file loading without fallback: %s', async (file, content, message) => {
  if (content !== undefined) await writeFile(join(directory, file), content);
  const fetcher = vi.fn<typeof fetch>();
  await expect(
    loadContractCatalog({ systemName, file }, { rootDirectory: directory, fetcher }),
  ).rejects.toThrow(message);
  expect(fetcher).not.toHaveBeenCalled();
});
it.each([
  [{ latest: true }, 'https://catalog.example/base/catalogs/widgets-api', null],
  [
    { selector: 'feature/a b' },
    'https://catalog.example/base/catalogs/widgets-api/feature%2Fa%20b',
    'feature/a b',
  ],
] as const)('handles explicit latest and selector sources %j', async (selection, url, selector) => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json(fixtureCatalog()));
  const snapshot = await loadContractCatalog(
    { systemName, catalogApiUrl: 'https://catalog.example/base/', selection },
    { fetcher },
  );
  expect(fetcher).toHaveBeenCalledExactlyOnceWith(
    url,
    expect.objectContaining({ signal: expect.any(AbortSignal) }),
  );
  expect(snapshot.source.selector).toBe(selector);
});
it.each([
  ['HTTP 404', () => Promise.resolve(new Response('missing', { status: 404 }))],
  ['offline', () => Promise.reject(new Error('offline'))],
  ['JSON', () => Promise.resolve(new Response('{'))],
  ['catalogVersion', () => Promise.resolve(Response.json({ catalogVersion: 2, scenarios: [] }))],
] as const)('fails network loading without fallback: %s', async (message, implementation) => {
  const fetcher = vi.fn<typeof fetch>().mockImplementation(implementation);
  await expect(
    loadContractCatalog(
      { systemName, catalogApiUrl: 'https://catalog.example', selection: { latest: true } },
      { fetcher },
    ),
  ).rejects.toThrow(message);
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it('rejects blank and ambiguous declarations without I/O', async () => {
  const fetcher = vi.fn<typeof fetch>();
  for (const source of [
    { systemName: '', file: 'widgets.json' },
    { systemName, file: '' },
    { systemName, catalogApiUrl: 'https://catalog.example', selection: { selector: '' } },
  ] as const)
    await expect(loadContractCatalog(source, { fetcher })).rejects.toThrow(/nonblank/);
  // @ts-expect-error A source cannot simultaneously select file and remote inputs.
  const mixed: ContractCatalogSource = {
    systemName,
    file: 'widgets.json',
    catalogApiUrl: 'https://catalog.example',
    selection: { latest: true },
  };
  await expect(loadContractCatalog(mixed, { fetcher })).rejects.toThrow('not both');
  expect(fetcher).not.toHaveBeenCalled();
});
it('deduplicates normalized remote sources registered under aliases and isolates copies', async () => {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockImplementation(async () => Response.json(fixtureCatalog()));
  const first = {
    systemName,
    catalogApiUrl: 'https://catalog.example/',
    selection: { latest: true },
  } as const;
  const run = await prepareContractRun({
    rootDirectory: directory,
    outputDirectory: 'results',
    catalogs: { widgets: first, other: { ...first, catalogApiUrl: 'https://catalog.example' } },
    fetcher,
  });
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(run.catalogs['widgets']).toEqual(run.catalogs['other']);
  run.catalogs['widgets'].catalog.scenarios.length = 0;
  expect(run.catalogs['other'].catalog.scenarios).toHaveLength(1);
});
it('loads each distinct source and selection separately', async () => {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockImplementation(async () => Response.json(fixtureCatalog()));
  await prepareContractRun({
    rootDirectory: directory,
    outputDirectory: 'results',
    catalogs: {
      latest: { systemName, catalogApiUrl: 'https://catalog.example', selection: { latest: true } },
      selected: {
        systemName,
        catalogApiUrl: 'https://catalog.example',
        selection: { selector: 'main' },
      },
      other: {
        systemName: 'other-api',
        catalogApiUrl: 'https://catalog.example',
        selection: { latest: true },
      },
    },
    fetcher,
  });
  expect(fetcher).toHaveBeenCalledTimes(3);
});
it('deduplicates file aliases and saves unique digest-verified run artifacts', async () => {
  const source = { systemName, file: 'widgets.json' };
  const options = {
    rootDirectory: directory,
    outputDirectory: 'results',
    catalogs: { widgets: source, '../other': { ...source, file: './widgets.json' } },
  };
  const first = await prepareContractRun(options);
  const second = await prepareContractRun(options);
  expect(first.directory).not.toBe(second.directory);
  expect(first.directory).toContain(join(directory, 'results'));
  const sources = JSON.parse(
    await readFile(join(first.directory, 'source.json'), 'utf8'),
  ) as Record<string, { snapshot: string }>;
  for (const [alias, source] of Object.entries(sources)) {
    expect(source.snapshot).toMatch(/^catalog-\d.json$/);
    expect(await readCatalogSnapshot(join(first.directory, source.snapshot))).toEqual(
      first.catalogs[alias],
    );
  }
});
it('requires catalog aliases and an output directory', async () => {
  await expect(prepareContractRun({ outputDirectory: '', catalogs: {} })).rejects.toThrow(
    'outputDirectory',
  );
  await expect(prepareContractRun({ outputDirectory: directory, catalogs: {} })).rejects.toThrow(
    'at least one',
  );
  await expect(
    prepareContractRun({
      outputDirectory: directory,
      catalogs: { ' ': { systemName, file: 'widgets.json' } },
    }),
  ).rejects.toThrow('alias');
});
