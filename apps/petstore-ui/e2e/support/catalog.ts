import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseCatalog, type Catalog, type Scenario } from '@response-capture/contracts/scenarios';

export interface CatalogSnapshot {
  catalog: Catalog;
  source: {
    systemName: 'petstore-api';
    selector: string | null;
    url: string;
    sha256: string;
  };
}

export class ScenarioCatalog {
  private readonly scenarios: ReadonlyMap<string, Scenario>;

  constructor(value: unknown) {
    this.scenarios = new Map(
      parseCatalog(value).scenarios.map((scenario) => [scenario.id, scenario]),
    );
  }

  get(id: string): Scenario {
    const scenario = this.scenarios.get(id);
    if (!scenario) throw new Error(`Unknown petstore-api scenario ID: ${id}`);
    return structuredClone(scenario);
  }
}

export function catalogDigest(catalog: Catalog): string {
  return createHash('sha256').update(JSON.stringify(catalog)).digest('hex');
}

export async function fetchCatalog(
  baseUrl: string,
  selector: string | undefined,
  fetcher: typeof fetch = fetch,
): Promise<CatalogSnapshot> {
  const selected = selector?.trim() ? selector : null;
  const url = `${baseUrl.replace(/\/+$/, '')}/catalogs/petstore-api${selected === null ? '' : `/${encodeURIComponent(selected)}`}`;
  try {
    const response = await fetcher(url, { signal: AbortSignal.timeout(30_000) });
    if (!response.ok)
      throw new Error(`HTTP ${response.status}: ${(await response.text()).slice(0, 1000)}`);
    const catalog = parseCatalog(await response.json());
    return {
      catalog,
      source: {
        systemName: 'petstore-api',
        selector: selected,
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

export function snapshotPath(): string {
  const directory = process.env['PETSTORE_E2E_RUN_DIR'];
  if (!directory)
    throw new Error('Run these tests using the petstore-ui Playwright configuration.');
  return join(directory, 'catalog.json');
}

export async function readCatalogSnapshot(path = snapshotPath()): Promise<CatalogSnapshot> {
  const value: unknown = JSON.parse(await readFile(path, 'utf8'));
  if (!value || typeof value !== 'object' || !('catalog' in value) || !('source' in value)) {
    throw new Error('Invalid catalog snapshot; rerun the catalog setup project.');
  }
  const catalog = parseCatalog(value.catalog);
  const source = value.source;
  if (
    !source ||
    typeof source !== 'object' ||
    !('systemName' in source) ||
    source.systemName !== 'petstore-api' ||
    !('selector' in source) ||
    (source.selector !== null && typeof source.selector !== 'string') ||
    !('url' in source) ||
    typeof source.url !== 'string' ||
    !('sha256' in source) ||
    source.sha256 !== catalogDigest(catalog)
  )
    throw new Error('Invalid catalog snapshot provenance or digest; rerun catalog setup.');
  return {
    catalog,
    source: {
      systemName: 'petstore-api',
      selector: source.selector,
      url: source.url,
      sha256: source.sha256,
    },
  };
}
