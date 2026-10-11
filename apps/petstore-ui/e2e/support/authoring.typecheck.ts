// Compile-only checks; never invoked by Playwright.
import { test } from './fixtures';
import { petScenarios, type CreatePetRequest } from './scenarios';
import type { Pet } from '@response-capture/contracts/petstore';
export function checkAuthoringTypes() {
  test('typed handles', async ({ catalogs, replay }) => {
    const { create } = await replay.replace({
      create: petScenarios.create,
    });
    const input: CreatePetRequest = create.request.body;
    const saved: Pet = create.response.body;
    // @ts-expect-error Recorded create inputs do not have a server-assigned ID.
    input.id;
    saved.id.toFixed();
    create.calls();
    const next = await replay.replace({ detail: petScenarios.detail });
    next.detail.assertUsed();
    // @ts-expect-error Only selected handle names are available.
    next.missing.calls();
    // @ts-expect-error Replacements must use a configured catalog source.
    await replay.replace({ account: { catalog: 'accounts', id: 'account.read' } });
    await catalogs.get('pets', 'pet.read.success');
    const example = await catalogs.get(petScenarios.create);
    example.request.body.photoUrls.join('\n');
    example.response.body.tags.map((tag) => tag.name);
    // @ts-expect-error Catalog lookup preserves configured aliases.
    await catalogs.get('accounts', 'account.read');
  });
  test.only('typed focused test', async ({ replay }) => {
    const next = await replay.replace({ create: petScenarios.create });
    next.create.calls();
    next.create.response.body.id.toFixed();
    // @ts-expect-error Native modifiers preserve fixture inference.
    next.missing.calls();
  });
}
