// Executed by loader.spec.ts in an isolated Playwright run with a synthetic catalog service.
import { test, expect } from '../support/fixtures';
const catalogApiUrl = process.env['HARNESS_CATALOG_URL'];
const declaration = {
  catalogs: {
    pets: { systemName: 'petstore-api', selection: { latest: true }, catalogApiUrl },
    accounts: {
      systemName: 'accounts-api',
      selection: { selector: 'main' },
      catalogApiUrl,
      routing: { origin: 'ui', pathPrefix: '/accounts', protectedPaths: ['/pet'] },
    },
    remoteAccounts: {
      systemName: 'accounts-api',
      selection: { selector: 'main' },
      catalogApiUrl,
      routing: { origin: 'http://accounts.test', protectedPaths: ['/pet'] },
    },
  },
  scenarios: {
    pet: { catalog: 'pets', id: 'read' },
    account: { catalog: 'accounts', id: 'read' },
    remote: { catalog: 'remoteAccounts', id: 'read' },
  },
} as const;

test.describe('native grouping and hooks', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/pets/new');
    // Automatic activation also precedes beforeEach hooks.
    const bodies: unknown = await page.evaluate(async () =>
      Promise.all([
        fetch('/pet/1').then((response) => response.json()),
        fetch('/accounts/pet/1').then((response) => response.json()),
        fetch('http://accounts.test/pet/1').then((response) => response.json()),
      ]),
    );
    expect(bodies).toEqual([{ name: 'pets' }, { name: 'accounts' }, { name: 'accounts' }]);
  });
  for (const name of ['parallel one', 'parallel two', 'retry']) {
    test(name, declaration, async ({ scenarios, mocks }, testInfo) => {
      expect(scenarios.pet.calls()).toHaveLength(1);
      expect(scenarios.account.calls()).toHaveLength(1);
      expect(scenarios.account.source).toMatchObject({
        catalog: 'accounts',
        systemName: 'accounts-api',
        selector: 'main',
      });
      scenarios.pet.assertUsed();
      scenarios.account.assertUsed();
      scenarios.remote.assertUsed();
      expect(mocks.requests()).toHaveLength(3);
      if (name === 'retry') expect(testInfo.retry).toBe(1);
    });
  }
});

test.fail('unused activation fails at teardown', declaration, async ({ mocks }) => {
  expect(mocks.requests()).toEqual([]);
});
test.skip('skipped declarations retain source metadata', declaration, async () => {});

test.fail(
  'unknown scenario fails before entering the callback',
  {
    catalogs: declaration.catalogs,
    scenarios: { missing: { catalog: 'pets', id: 'unknown' } },
  },
  async () => {
    throw new Error('The callback must not run for an unknown scenario.');
  },
);

test.fail(
  'unmatched traffic is blocked and fails teardown',
  {
    catalogs: declaration.catalogs,
    scenarios: {},
  },
  async ({ page, mocks }) => {
    await page.goto('/pets/new');
    const blocked = await page.evaluate(async () => {
      try {
        await fetch('/accounts/pet/missing');
        return false;
      } catch {
        return true;
      }
    });
    expect(blocked).toBe(true);
    expect(mocks.requests()).toHaveLength(1);
  },
);
