import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { parseCatalog, type Catalog, type Scenario } from '@response-capture/contracts/scenarios';

export type CatalogSelection =
  { latest: true; selector?: never } | { selector: string; latest?: never };
export interface CatalogSource {
  systemName: string;
  selection: CatalogSelection;
  catalogApiUrl?: string;
}
export interface CatalogSnapshot {
  catalog: Catalog;
  source: { systemName: string; selector: string | null; url: string; sha256: string };
}

export function catalogSelectionFromEnv(value = process.env['CATALOG_SELECTOR']): CatalogSelection {
  return value?.trim() ? { selector: value } : { latest: true };
}

export class ScenarioCatalog {
  private readonly scenarios: ReadonlyMap<string, Scenario>;
  constructor(
    value: unknown,
    private readonly systemName: string,
  ) {
    this.scenarios = new Map(
      parseCatalog(value).scenarios.map((scenario) => [scenario.id, scenario]),
    );
  }
  get(id: string): Scenario {
    const scenario = this.scenarios.get(id);
    if (!scenario) throw new Error(`Unknown ${this.systemName} scenario ID: ${id}`);
    return structuredClone(scenario);
  }
}

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
    throw new Error('Invalid catalog snapshot; rerun Playwright.');
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
    throw new Error('Invalid catalog snapshot provenance or digest; rerun Playwright.');
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
