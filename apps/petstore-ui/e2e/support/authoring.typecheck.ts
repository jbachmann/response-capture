// Compile-only checks for editor inference. This function is never invoked by Playwright.
import { test } from './fixtures';
export function checkAuthoringTypes() {
  test(
    'typed handles',
    {
      catalogs: { pets: { systemName: 'petstore-api', selection: { latest: true } } },
      scenarios: { create: { catalog: 'pets', id: 'pet.create.success' } },
    },
    async ({ scenarios, mocks }) => {
      scenarios.create.calls();
      // @ts-expect-error Only declared handle names are available.
      scenarios.missing.calls();
      const next = mocks.replaceScenarios({ detail: { catalog: 'pets', id: 'pet.read.success' } });
      next.detail.assertUsed();
      // @ts-expect-error Replacements must use a declared catalog source.
      mocks.replaceScenarios({ account: { catalog: 'accounts', id: 'account.read' } });
    },
  );
  test(
    'unknown source',
    {
      catalogs: { pets: { systemName: 'petstore-api', selection: { latest: true } } },
      // @ts-expect-error Initial selections must use a declared catalog source.
      scenarios: { create: { catalog: 'accounts', id: 'pet.create.success' } },
    },
    async () => {},
  );
  test.only(
    'typed focused test',
    {
      catalogs: { pets: { systemName: 'petstore-api', selection: { selector: 'main' } } },
      scenarios: { create: { catalog: 'pets', id: 'pet.create.success' } },
    },
    async ({ scenarios }) => {
      scenarios.create.calls();
      // @ts-expect-error Modifiers preserve handle inference.
      scenarios.missing.calls();
    },
  );
}
