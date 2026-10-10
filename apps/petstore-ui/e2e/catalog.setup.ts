import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { test } from '@playwright/test';
import { fetchCatalog, snapshotPath } from './support/catalog';

test('snapshot the selected petstore-api catalog', async ({}, testInfo) => {
  const snapshot = await fetchCatalog(
    process.env['CATALOG_API_URL'] ?? 'http://localhost:3001',
    process.env['CATALOG_SELECTOR'],
  );
  const path = snapshotPath();
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(snapshot, null, 2)}\n`);
  await testInfo.attach('petstore-api-catalog', { path, contentType: 'application/json' });
  testInfo.annotations.push({ type: 'catalog', description: JSON.stringify(snapshot.source) });
});
