import { randomUUID, createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { catalogUrl, fetchCatalog, readCatalogSnapshot, type CatalogSource } from './catalog';

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
      const baseUrl =
        source.catalogApiUrl ?? process.env['CATALOG_API_URL'] ?? 'http://localhost:3001';
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
    url: process.env['CATALOG_SNAPSHOT_LOADER_URL'],
    token: process.env['CATALOG_SNAPSHOT_LOADER_TOKEN'],
  },
) {
  if (!connection.url || !connection.token)
    throw new Error('Run these tests using the petstore-ui Playwright configuration.');
  const response = await fetch(connection.url, {
    method: 'POST',
    headers: { authorization: `Bearer ${connection.token}`, 'content-type': 'application/json' },
    body: JSON.stringify(source),
    signal: AbortSignal.timeout(35_000),
  });
  const result = (await response.json()) as { path?: string; error?: string };
  if (!response.ok || !result.path) throw new Error(result.error ?? 'Snapshot loader failed.');
  const snapshot = await readCatalogSnapshot(result.path);
  const url = catalogUrl(
    source.catalogApiUrl ?? process.env['CATALOG_API_URL'] ?? 'http://localhost:3001',
    source,
  );
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
