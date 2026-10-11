import { createHash, randomUUID } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { join, resolve } from 'node:path';
import { parseCatalog, type Catalog } from '@response-capture/contracts/scenarios';
import type { CatalogSource, CatalogSnapshot } from './catalog.js';

export function catalogDigest(catalog: Catalog): string {
  return createHash('sha256').update(JSON.stringify(catalog)).digest('hex');
}

export function catalogUrl(baseUrl: string, source: CatalogSource): string {
  if (!source.systemName?.trim()) throw new Error('Catalog systemName must be nonblank.');
  const selection = source.selection;
  if (
    !selection ||
    (selection.latest !== true && !selection.selector?.trim()) ||
    (selection.latest === true && selection.selector !== undefined)
  ) {
    throw new Error('Choose { latest: true } or a nonblank { selector }.');
  }
  const base = new URL(baseUrl);
  if (!['http:', 'https:'].includes(base.protocol) || base.search || base.hash) {
    throw new Error('Catalog API URL must be an HTTP(S) URL without query or fragment.');
  }
  return `${base.href.replace(/\/+$/, '')}/catalogs/${encodeURIComponent(source.systemName)}${selection.latest === true ? '' : `/${encodeURIComponent(selection.selector)}`}`;
}

export async function fetchCatalog(
  baseUrl: string,
  source: CatalogSource,
  fetcher: typeof fetch = fetch,
): Promise<CatalogSnapshot> {
  const url = catalogUrl(baseUrl, source);
  try {
    const response = await fetcher(url, { signal: AbortSignal.timeout(30_000) });
    if (!response.ok)
      throw new Error(`HTTP ${response.status}: ${(await response.text()).slice(0, 1000)}`);
    const catalog = parseCatalog(await response.json());
    return {
      catalog,
      source: {
        systemName: source.systemName,
        selector: source.selection.latest === true ? null : source.selection.selector,
        url,
        sha256: catalogDigest(catalog),
      },
    };
  } catch (error) {
    throw new Error(
      `Cannot load catalog from ${url}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export async function readCatalogSnapshot(path: string): Promise<CatalogSnapshot> {
  const value: unknown = JSON.parse(await readFile(path, 'utf8'));
  if (!value || typeof value !== 'object' || !('catalog' in value) || !('source' in value)) {
    throw new Error('Invalid catalog snapshot; load a fresh snapshot.');
  }
  const catalog = parseCatalog(value.catalog);
  const source = value.source;
  if (
    !source ||
    typeof source !== 'object' ||
    !('systemName' in source) ||
    typeof source.systemName !== 'string' ||
    !source.systemName.trim() ||
    !('selector' in source) ||
    (source.selector !== null &&
      (typeof source.selector !== 'string' || !source.selector.trim())) ||
    !('url' in source) ||
    typeof source.url !== 'string' ||
    !('sha256' in source) ||
    source.sha256 !== catalogDigest(catalog)
  ) {
    throw new Error('Invalid catalog snapshot provenance or digest; load a fresh snapshot.');
  }
  return {
    catalog,
    source: {
      systemName: source.systemName,
      selector: source.selector,
      url: source.url,
      sha256: source.sha256,
    },
  };
}

function requireCatalogApiUrl(source: CatalogSource): string {
  if (!source.catalogApiUrl) throw new Error('Catalog source requires catalogApiUrl.');
  return source.catalogApiUrl;
}

/** One broker in the Playwright parent process; concurrent workers share the same promise. */
export async function startSnapshotLoader(directory: string, fetcher: typeof fetch = fetch) {
  await mkdir(directory, { recursive: true });
  const token = randomUUID();
  const snapshots = new Map<string, Promise<string>>();
  const server = createServer(async (request, response) => {
    response.setHeader('content-type', 'application/json');
    if (
      request.method !== 'POST' ||
      request.url !== '/' ||
      request.headers.authorization !== `Bearer ${token}`
    ) {
      response.writeHead(403).end(JSON.stringify({ error: 'Forbidden' }));
      return;
    }
    try {
      let body = '';
      for await (const chunk of request) {
        body += String(chunk);
        if (body.length > 16_384) throw new Error('Catalog source declaration is too large.');
      }
      const source = JSON.parse(body) as CatalogSource;
      const baseUrl = requireCatalogApiUrl(source);
      const key = catalogUrl(baseUrl, source);
      let pending = snapshots.get(key);
      if (!pending) {
        pending = (async () => {
          const snapshot = await fetchCatalog(baseUrl, source, fetcher);
          const path = join(directory, `${createHash('sha256').update(key).digest('hex')}.json`);
          await writeFile(path, `${JSON.stringify(snapshot, null, 2)}\n`);
          return path;
        })();
        snapshots.set(key, pending);
      }
      response.end(JSON.stringify({ path: await pending }));
    } catch (error) {
      response
        .writeHead(500)
        .end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
    }
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing snapshot loader address.');
  return {
    url: `http://127.0.0.1:${address.port}/`,
    token,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
        server.closeIdleConnections();
      }),
  };
}

export async function loadSnapshot(
  source: CatalogSource,
  connection = {
    url: process.env['SCENARIO_CLIENT_LOADER_URL'],
    token: process.env['SCENARIO_CLIENT_LOADER_TOKEN'],
  },
) {
  if (!connection.url || !connection.token)
    throw new Error(
      'Configure scenarioGlobalSetup in Playwright global setup before using catalog fixtures.',
    );
  const response = await fetch(connection.url, {
    method: 'POST',
    headers: { authorization: `Bearer ${connection.token}`, 'content-type': 'application/json' },
    body: JSON.stringify(source),
    signal: AbortSignal.timeout(35_000),
  });
  const result = (await response.json()) as { path?: string; error?: string };
  if (!response.ok || !result.path) throw new Error(result.error ?? 'Snapshot loader failed.');
  const snapshot = await readCatalogSnapshot(result.path);
  const url = catalogUrl(requireCatalogApiUrl(source), source);
  if (
    snapshot.source.url !== url ||
    snapshot.source.systemName !== source.systemName ||
    snapshot.source.selector !==
      (source.selection.latest === true ? null : source.selection.selector)
  ) {
    throw new Error('Snapshot source does not match the requested catalog.');
  }
  return { snapshot, path: result.path };
}

/** Start an isolated run and publish its connection to subsequently spawned workers. */
export async function startCatalogRun(options: { outputDirectory: string }) {
  if (!options.outputDirectory.trim()) throw new Error('outputDirectory must be nonempty.');
  const directory = join(resolve(options.outputDirectory), randomUUID());
  const loader = await startSnapshotLoader(directory);
  const previousURL = process.env['SCENARIO_CLIENT_LOADER_URL'];
  const previousToken = process.env['SCENARIO_CLIENT_LOADER_TOKEN'];
  process.env['SCENARIO_CLIENT_LOADER_URL'] = loader.url;
  process.env['SCENARIO_CLIENT_LOADER_TOKEN'] = loader.token;
  return {
    directory,
    close: async () => {
      try {
        await loader.close();
      } finally {
        if (previousURL === undefined) delete process.env['SCENARIO_CLIENT_LOADER_URL'];
        else process.env['SCENARIO_CLIENT_LOADER_URL'] = previousURL;
        if (previousToken === undefined) delete process.env['SCENARIO_CLIENT_LOADER_TOKEN'];
        else process.env['SCENARIO_CLIENT_LOADER_TOKEN'] = previousToken;
      }
    },
  };
}
