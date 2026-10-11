import { test as base, expect } from '@playwright/test';
import { scenarioFixtures } from '@response-capture/scenario-client/playwright';
import { catalogSelectionFromEnv } from './catalog';
import { systems } from './systems';

const scenarioTest = base.extend(
  scenarioFixtures({
    catalogs: {
      pets: {
        systemName: 'petstore-api',
        selection: catalogSelectionFromEnv(),
        catalogApiUrl: process.env['CATALOG_API_URL'] ?? 'http://localhost:3001',
        routing: systems['petstore-api']!,
      },
    },
  }),
);

// Petstore owns the deterministic photo failure policy; it is unrelated to replay.
export const test = scenarioTest.extend<{ photoFallback: void }>({
  photoFallback: [
    async ({ page, baseURL }, use) => {
      const images = (url: URL) => url.origin !== new URL(baseURL!).origin;
      const handler = async (route: import('@playwright/test').Route) => {
        if (route.request().resourceType() === 'image') await route.abort();
        else await route.fallback();
      };
      await page.route(images, handler);
      try {
        await use();
      } finally {
        if (!page.isClosed()) await page.unroute(images, handler);
      }
    },
    { auto: true },
  ],
});
test.use({ scenarioReplayPolicy: 'error' });
export { expect };
