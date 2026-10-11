import type { CatalogSelection } from '@response-capture/scenario-client';

export function catalogSelectionFromEnv(value = process.env['CATALOG_SELECTOR']): CatalogSelection {
  return value?.trim() ? { selector: value } : { latest: true };
}
