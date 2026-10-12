import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseCatalog } from '@response-capture/contracts/scenarios';
import type { CatalogSnapshot } from '@response-capture/scenario-client';
import { catalogDigest, fetchCatalog } from '@response-capture/scenario-client/node';

export interface CatalogEnvironment {
  CONTRACT_CATALOG_PATH?: string;
  CATALOG_API_URL?: string;
  CATALOG_SELECTOR?: string;
}

function catalogEnvironment(): CatalogEnvironment {
  return {
    CONTRACT_CATALOG_PATH: process.env['CONTRACT_CATALOG_PATH'],
    CATALOG_API_URL: process.env['CATALOG_API_URL'],
    CATALOG_SELECTOR: process.env['CATALOG_SELECTOR'],
  };
}

export async function loadContractCatalog(
  workspace: string,
  env: CatalogEnvironment = catalogEnvironment(),
  fetcher: typeof fetch = fetch,
): Promise<CatalogSnapshot> {
  if (env.CONTRACT_CATALOG_PATH !== undefined) {
    if (!env.CONTRACT_CATALOG_PATH.trim())
      throw new Error('CONTRACT_CATALOG_PATH must be nonblank');
    const filename = resolve(workspace, env.CONTRACT_CATALOG_PATH);
    try {
      const catalog = parseCatalog(JSON.parse(await readFile(filename, 'utf8')));
      return {
        catalog,
        source: {
          systemName: 'petstore-api',
          selector: null,
          url: pathToFileURL(filename).href,
          sha256: catalogDigest(catalog),
        },
      };
    } catch (error) {
      throw new Error(
        `Cannot load contract catalog from ${filename}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  return fetchCatalog(
    env.CATALOG_API_URL ?? 'http://localhost:3001',
    {
      systemName: 'petstore-api',
      selection: env.CATALOG_SELECTOR?.trim()
        ? { selector: env.CATALOG_SELECTOR }
        : { latest: true },
    },
    fetcher,
  );
}

export async function prepareContractRun(
  workspace: string,
  env: CatalogEnvironment = catalogEnvironment(),
  fetcher: typeof fetch = fetch,
) {
  const snapshot = await loadContractCatalog(workspace, env, fetcher);
  const directory = join(workspace, 'test-results', 'contract', randomUUID());
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, 'snapshot.json'), `${JSON.stringify(snapshot, null, 2)}\n`);
  await writeFile(join(directory, 'source.json'), `${JSON.stringify(snapshot.source, null, 2)}\n`);
  return { snapshot, directory };
}
