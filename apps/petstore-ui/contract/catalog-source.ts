import type { ContractCatalogSource } from '@response-capture/scenario-contract/node';

export interface CatalogEnvironment {
  CONTRACT_CATALOG_PATH?: string;
  CATALOG_API_URL?: string;
  CATALOG_SELECTOR?: string;
}

/** Application defaults and environment conventions belong to this consumer. */
export function petstoreCatalogSource(
  env: CatalogEnvironment = {
    CONTRACT_CATALOG_PATH: process.env['CONTRACT_CATALOG_PATH'],
    CATALOG_API_URL: process.env['CATALOG_API_URL'],
    CATALOG_SELECTOR: process.env['CATALOG_SELECTOR'],
  },
): ContractCatalogSource {
  if (env.CONTRACT_CATALOG_PATH !== undefined) {
    if (!env.CONTRACT_CATALOG_PATH.trim())
      throw new Error('CONTRACT_CATALOG_PATH must be nonblank');
    return { systemName: 'petstore-api', file: env.CONTRACT_CATALOG_PATH };
  }
  return {
    systemName: 'petstore-api',
    catalogApiUrl: env.CATALOG_API_URL ?? 'http://localhost:3001',
    selection: env.CATALOG_SELECTOR?.trim() ? { selector: env.CATALOG_SELECTOR } : { latest: true },
  };
}
