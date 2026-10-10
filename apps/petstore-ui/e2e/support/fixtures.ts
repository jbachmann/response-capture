import { test as base, expect } from '@playwright/test';
import { createNetworkFixture, type NetworkFixture } from '@msw/playwright';
import { readCatalogSnapshot, ScenarioCatalog } from './catalog';
import { ScenarioSession } from './scenarios';

export const test = base.extend<{
  network: NetworkFixture;
  catalog: ScenarioCatalog;
  scenarios: ScenarioSession;
}>({
  network: createNetworkFixture(),
  catalog: async ({}, use, testInfo) => {
    const snapshot = await readCatalogSnapshot();
    await testInfo.attach('catalog-source', {
      body: JSON.stringify(snapshot.source, null, 2),
      contentType: 'application/json',
    });
    await use(new ScenarioCatalog(snapshot.catalog));
  },
  scenarios: [
    async ({ catalog, network, baseURL }, use, testInfo) => {
      if (!baseURL) throw new Error('The UI baseURL is required.');
      const scenarios = new ScenarioSession(catalog, baseURL, network);
      try {
        await use(scenarios);
        scenarios.verify();
      } finally {
        await testInfo.attach('catalog-requests', {
          body: JSON.stringify(scenarios.diagnostics(), null, 2),
          contentType: 'application/json',
        });
      }
    },
    { auto: true },
  ],
});

export { expect };
