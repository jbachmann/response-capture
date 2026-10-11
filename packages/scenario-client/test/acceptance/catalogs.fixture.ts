import { test as base, expect } from '@playwright/test';
import { scenarioFixtures } from '@response-capture/scenario-client/playwright';
import { scenarioReferences, type ScenarioHandles } from '@response-capture/scenario-client';

interface NamedBody {
  name: string;
}

const catalogApiUrl = process.env['HARNESS_CATALOG_URL']!;
const appBase = base.extend<{ nativeValue: string }>({
  nativeValue: 'existing fixture',
  page: async ({ page, context }, use, testInfo) => {
    testInfo.annotations.push({ type: 'existing-page-fixture' });
    await page.route(`${catalogApiUrl}/pets/new`, (route) =>
      route.fulfill({ contentType: 'text/html', body: '<html><body>Test app</body></html>' }),
    );
    await page.route(`${catalogApiUrl}/legacy/page`, (route) =>
      route.fulfill({ json: { name: 'legacy page' } }),
    );
    await context.route(`${catalogApiUrl}/legacy/context`, (route) =>
      route.fulfill({ json: { name: 'legacy context' } }),
    );
    await page.route(`${catalogApiUrl}/pet/1`, (route) =>
      route.fulfill({ json: { name: 'legacy pet' } }),
    );
    await use(page);
    // Replay has torn down before its page dependency. Existing handlers must survive.
    if (!page.isClosed() && page.url() === `${catalogApiUrl}/pets/new`)
      expect(
        await page.evaluate(() => fetch('/pet/1').then((response) => response.json())),
      ).toEqual({ name: 'legacy pet' });
  },
});
const test = appBase.extend(
  scenarioFixtures({
    catalogs: {
      pets: {
        systemName: 'petstore-api',
        selection: { latest: true },
        catalogApiUrl,
        routing: { origin: 'ui', protectedPaths: ['/pet'] },
      },
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
      unused: {
        systemName: 'never-fetch',
        selection: { latest: true },
        catalogApiUrl,
        routing: { origin: 'ui', pathPrefix: '/unused', protectedPaths: ['/'] },
      },
    },
  }),
);
const references = {
  pet: scenarioReferences('pets').define<null, NamedBody>('read'),
  account: { catalog: 'accounts', id: 'read' },
  remote: scenarioReferences('remoteAccounts').define<null, NamedBody>('read'),
} as const;
const journey = test.extend<{ selected: ScenarioHandles<typeof references> }>({
  selected: async ({ replay }, use) => {
    await use(await replay.replace(references));
  },
});

journey.describe('native grouping and hooks', () => {
  journey.beforeEach(async ({ page, selected }) => {
    expect(selected.pet.id).toBe('read'); // Selection precedes navigation through a fixture dependency.
    expect(selected.pet.response.body.name).toBe('pets');
    expect(selected.remote.response.body.name).toBe('accounts');
    await page.goto('/pets/new');
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
    journey(name, { tag: '@catalog' }, async ({ selected, replay, nativeValue }, testInfo) => {
      expect(nativeValue).toBe('existing fixture');
      for (const handle of Object.values(selected)) {
        expect(handle.calls()).toHaveLength(1);
        handle.assertUsed();
      }
      expect(selected.account.source).toMatchObject({
        catalog: 'accounts',
        systemName: 'accounts-api',
        selector: 'main',
      });
      expect(replay.requests()).toHaveLength(3);
      if (name === 'retry') expect(testInfo.retry).toBe(1);
    });
  }
  journey.afterEach(async ({ selected, page }) => {
    // A mismatch during afterEach must still be visible to fixture teardown verification.
    expect(selected.pet.calls()).toHaveLength(1);
    expect(page.url()).toBe(`${catalogApiUrl}/pets/new`);
  });
});

test('mixed existing mocks and live calls', async ({ page, replay }) => {
  const { pet } = await replay.replace({ pet: references.pet });
  await expect(
    replay.replace({
      bad: scenarioReferences('pets').define<null, NamedBody>('unknown'),
    }),
  ).rejects.toThrow('Unknown');
  await page.goto('/pets/new');
  const bodies: unknown = await page.evaluate(
    async (liveURL) =>
      Promise.all([
        fetch('/pet/1').then((response) => response.json()),
        fetch('/legacy/page').then((response) => response.json()),
        fetch('/legacy/context').then((response) => response.json()),
        fetch(liveURL).then((response) => response.json()),
      ]),
    `${catalogApiUrl}/live`,
  );
  expect(bodies).toEqual([
    { name: 'pets' },
    { name: 'legacy page' },
    { name: 'legacy context' },
    { name: 'live' },
  ]);
  expect(replay.requests()).toHaveLength(1);
  pet.assertUsed();
});

test('data-only access', async ({ catalogs }) => {
  const first = await catalogs.get(references.pet);
  expect(first.response.body.name).toBe(process.env['HARNESS_EXPECTED_PET'] ?? 'pets');
  const originalSource = { ...first.source };
  first.response.body.name = 'modified';
  first.source.sha256 = 'modified';
  const second = await catalogs.get(references.pet);
  expect(second.source).toEqual(originalSource);
  expect(second.response.body.name).toBe(process.env['HARNESS_EXPECTED_PET'] ?? 'pets');
  expect((await catalogs.get('pets', 'read')).response.body).toEqual({
    name: process.env['HARNESS_EXPECTED_PET'] ?? 'pets',
  });
});
test('closing the page preserves verification and diagnostics', async ({ page, replay }) => {
  const { pet } = await replay.replace({ pet: references.pet });
  await page.goto('/pets/new');
  expect(await page.evaluate(() => fetch('/pet/1').then((response) => response.json()))).toEqual({
    name: 'pets',
  });
  pet.assertUsed();
  await page.close();
});
test.describe('verification after hooks', () => {
  test.beforeEach(async ({ replay }) => {
    await replay.replace({ pet: references.pet });
  });
  test.afterEach(async ({ page }) => {
    expect(await page.evaluate(() => fetch('/pet/1').then((response) => response.json()))).toEqual({
      name: 'pets',
    });
  });
  test('activation can be used in afterEach', async ({ page }) => {
    await page.goto('/pets/new');
  });
});
test('untouched legacy test', async ({ nativeValue }) => {
  expect(nativeValue).toBe('existing fixture');
});
test.skip('skipped native test', async ({ replay }) => {
  await replay.replace(references);
});
test.fail('unused activation fails at teardown', async ({ replay }) => {
  await replay.replace({ pet: references.pet });
  expect(replay.requests()).toEqual([]);
});
test.fail('unknown scenario fails before the next action', async ({ replay }) => {
  await replay.replace({ missing: scenarioReferences('pets').define<null, NamedBody>('unknown') });
  throw new Error('The next action must not run');
});

test.describe('strict replay', () => {
  test.use({ scenarioReplayPolicy: 'error' });
  test.fail('unmatched traffic fails teardown', async ({ page, replay }) => {
    await replay.replace({});
    await page.goto('/pets/new');
    expect(
      await page.evaluate(async () => {
        try {
          await fetch('/accounts/pet/missing');
          return false;
        } catch {
          return true;
        }
      }),
    ).toBe(true);
    expect(replay.requests()).toHaveLength(1);
  });
});

test.describe('service worker configuration', () => {
  test.use({ serviceWorkers: 'allow' });
  test.fail('requires blocking service workers', async ({ replay }) => {
    await replay.replace({});
    throw new Error('The next action must not run');
  });
});

const dataTest = appBase.extend(
  scenarioFixtures({
    catalogs: {
      data: { systemName: 'petstore-api', selection: { latest: true }, catalogApiUrl },
    },
  }),
);
dataTest('data access needs no routing', async ({ catalogs }) => {
  const example = await catalogs.get(scenarioReferences('data').define<null, NamedBody>('read'));
  expect(example.response.body.name).toBe('pets');
});
