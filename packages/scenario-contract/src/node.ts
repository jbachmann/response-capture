import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseCatalog } from '@response-capture/contracts/scenarios';
import type { CatalogSelection, CatalogSnapshot } from '@response-capture/scenario-client';
import { catalogDigest, catalogUrl, fetchCatalog } from '@response-capture/scenario-client/node';

export type ContractCatalogSource =
  | { systemName: string; file: string; catalogApiUrl?: never; selection?: never }
  | { systemName: string; catalogApiUrl: string; selection: CatalogSelection; file?: never };

export interface LoadContractCatalogOptions {
  rootDirectory?: string;
  fetcher?: typeof fetch;
}
export interface ContractRunOptions extends LoadContractCatalogOptions {
  catalogs: Readonly<Record<string, ContractCatalogSource>>;
  outputDirectory: string;
}
export interface ContractRun {
  catalogs: Record<string, CatalogSnapshot>;
  directory: string;
}

function sourceKey(source: ContractCatalogSource, root: string): string {
  if (!source.systemName?.trim()) throw new Error('Catalog systemName must be nonblank');
  if (source.file !== undefined) {
    if (!source.file.trim()) throw new Error('Catalog file must be nonblank');
    if (source.catalogApiUrl !== undefined || source.selection !== undefined) {
      throw new Error('Choose a catalog file or an API URL and selection, not both');
    }
    return JSON.stringify([source.systemName, pathToFileURL(resolve(root, source.file)).href]);
  }
  return catalogUrl(source.catalogApiUrl, source);
}

export async function loadContractCatalog(
  source: ContractCatalogSource,
  options: LoadContractCatalogOptions = {},
): Promise<CatalogSnapshot> {
  const root = resolve(options.rootDirectory ?? process.cwd());
  sourceKey(source, root);
  if (source.file !== undefined) {
    const filename = resolve(root, source.file);
    try {
      const catalog = parseCatalog(JSON.parse(await readFile(filename, 'utf8')));
      return {
        catalog,
        source: {
          systemName: source.systemName,
          selector: null,
          url: pathToFileURL(filename).href,
          sha256: catalogDigest(catalog),
        },
      };
    } catch (error) {
      throw new Error(
        `Cannot load ${source.systemName} contract catalog from ${filename}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  return fetchCatalog(source.catalogApiUrl, source, options.fetcher);
}

/** Load every distinct source once, then persist the run before tests receive any snapshots. */
export async function prepareContractRun(options: ContractRunOptions): Promise<ContractRun> {
  if (!options.outputDirectory.trim()) throw new Error('outputDirectory must be nonblank');
  const entries = Object.entries(options.catalogs);
  if (!entries.length) throw new Error('Declare at least one contract catalog');
  const root = resolve(options.rootDirectory ?? process.cwd());
  const pending = new Map<string, Promise<CatalogSnapshot>>();
  const catalogs: Record<string, CatalogSnapshot> = Object.create(null);
  for (const [name, source] of entries) {
    if (!name.trim()) throw new Error('Catalog alias must be nonblank');
    const key = sourceKey(source, root);
    let snapshot = pending.get(key);
    if (!snapshot) {
      snapshot = loadContractCatalog(source, options);
      pending.set(key, snapshot);
    }
    catalogs[name] = structuredClone(await snapshot);
  }
  const directory = join(resolve(root, options.outputDirectory), randomUUID());
  await mkdir(directory, { recursive: true });
  // Numeric filenames keep arbitrary consumer aliases out of filesystem paths.
  const sources: Record<string, CatalogSnapshot['source'] & { snapshot: string }> =
    Object.create(null);
  for (const [index, [name, snapshot]] of Object.entries(catalogs).entries()) {
    const filename = `catalog-${index}.json`;
    await writeFile(join(directory, filename), `${JSON.stringify(snapshot, null, 2)}\n`);
    sources[name] = { ...snapshot.source, snapshot: filename };
  }
  await writeFile(join(directory, 'source.json'), `${JSON.stringify(sources, null, 2)}\n`);
  return { catalogs, directory };
}
