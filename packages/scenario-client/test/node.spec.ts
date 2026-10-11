import { test, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  startSnapshotLoader,
  loadSnapshot,
  fetchCatalog,
  startCatalogRun,
} from '@response-capture/scenario-client/node';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
let directory: string;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'scenario-client-node-'));
});
afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});
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
  await expect(
    fetchCatalog('http://catalog.test', { systemName: 'accounts', selection: { selector: '' } }),
  ).rejects.toThrow('nonblank');
});

test('share in-flight snapshots, freeze latest, and memoize failures', async () => {
  let fetches = 0;
  const loader = await startSnapshotLoader(join(directory, 'snapshots'), async (url) => {
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

test('runs isolate snapshots, restore connection environment, and compose with other setup', async () => {
  const previousURL = process.env['SCENARIO_CLIENT_LOADER_URL'];
  const previousToken = process.env['SCENARIO_CLIENT_LOADER_TOKEN'];
  const first = await startCatalogRun({ outputDirectory: directory });
  try {
    expect(process.env['SCENARIO_CLIENT_LOADER_URL']).toMatch(/^http:\/\/127\.0\.0\.1:/);
    expect(first.directory).toContain(directory);
    const second = await startCatalogRun({ outputDirectory: directory });
    try {
      expect(second.directory).not.toBe(first.directory);
    } finally {
      await second.close();
    }
    expect(process.env['SCENARIO_CLIENT_LOADER_URL']).toMatch(/^http:\/\/127\.0\.0\.1:/);
  } finally {
    await first.close();
  }
  expect(process.env['SCENARIO_CLIENT_LOADER_URL']).toBe(previousURL);
  expect(process.env['SCENARIO_CLIENT_LOADER_TOKEN']).toBe(previousToken);
});

test('root entrypoint imports without Node, Playwright, or MSW dependencies', async () => {
  const script = `
    import { registerHooks } from 'node:module';
    registerHooks({ resolve(specifier, context, next) {
      if (specifier.startsWith('node:') || /^(?:@playwright|playwright|msw|@msw)/.test(specifier))
        throw new Error('Unexpected root dependency: ' + specifier);
      return next(specifier, context);
    } });
    const client = await import('@response-capture/scenario-client');
    if (typeof client.ScenarioCatalog !== 'function' || typeof client.ReplaySession !== 'function')
      throw new Error('Missing root exports');
  `;
  await promisify(execFile)(process.execPath, ['--input-type=module', '-e', script], {
    cwd: process.cwd(),
  });
});

test('snapshot loading requires explicit service configuration and verifies source identity', async () => {
  const loader = await startSnapshotLoader(join(directory, 'snapshots'), async () =>
    Response.json(read('pets')),
  );
  try {
    await expect(
      loadSnapshot({ systemName: 'pets', selection: { latest: true } }, loader),
    ).rejects.toThrow('catalogApiUrl');
    const source = {
      systemName: 'pets',
      selection: { latest: true },
      catalogApiUrl: 'http://catalog.test',
    } as const;
    const loaded = await loadSnapshot(source, loader);
    const tampered = loaded.snapshot;
    tampered.source.systemName = 'different';
    await writeFile(loaded.path, JSON.stringify(tampered));
    await expect(loadSnapshot(source, loader)).rejects.toThrow('source does not match');
    expect(await readFile(loaded.path, 'utf8')).toContain('different');
  } finally {
    await loader.close();
  }
});
