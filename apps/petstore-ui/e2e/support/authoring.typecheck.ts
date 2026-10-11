// Compile-only checks; never invoked by Playwright.
import { test } from './fixtures';
export function checkAuthoringTypes() {
  test('typed handles', async ({ catalogs, replay }) => {
    const { create } = await replay.replace({
      create: { catalog: 'pets', id: 'pet.create.success' },
    });
    create.calls();
    const next = await replay.replace({ detail: { catalog: 'pets', id: 'pet.read.success' } });
    next.detail.assertUsed();
    // @ts-expect-error Only selected handle names are available.
    next.missing.calls();
    // @ts-expect-error Replacements must use a configured catalog source.
    await replay.replace({ account: { catalog: 'accounts', id: 'account.read' } });
    await catalogs.get('pets', 'pet.read.success');
    // @ts-expect-error Catalog lookup preserves configured aliases.
    await catalogs.get('accounts', 'account.read');
  });
  test.only('typed focused test', async ({ replay }) => {
    const next = await replay.replace({ create: { catalog: 'pets', id: 'pet.create.success' } });
    next.create.calls();
    // @ts-expect-error Native modifiers preserve fixture inference.
    next.missing.calls();
  });
}
