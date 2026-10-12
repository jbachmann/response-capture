import { fileURLToPath } from 'node:url';
import { contractGlobalSetup } from '@response-capture/scenario-contract/vitest';
import { petstoreCatalogSource } from './catalog-source';

export default contractGlobalSetup({
  catalogs: { pets: petstoreCatalogSource() },
  rootDirectory: fileURLToPath(new URL('../', import.meta.url)),
  outputDirectory: 'test-results/contract',
});
