import { startSnapshotLoader } from './support/snapshot-loader';

export default async function globalSetup() {
  const directory = process.env['PETSTORE_E2E_RUN_DIR'];
  if (!directory) throw new Error('Missing catalog snapshot directory.');
  const loader = await startSnapshotLoader(directory);
  process.env['CATALOG_SNAPSHOT_LOADER_URL'] = loader.url;
  process.env['CATALOG_SNAPSHOT_LOADER_TOKEN'] = loader.token;
  return async () => {
    await loader.close();
    delete process.env['CATALOG_SNAPSHOT_LOADER_URL'];
    delete process.env['CATALOG_SNAPSHOT_LOADER_TOKEN'];
  };
}
