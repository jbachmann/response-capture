import { test as base } from '@playwright/test';
import { scenarioFixtures } from '@response-capture/scenario-client/playwright';

const test = base.extend<{ custom: string }>({ custom: 'existing' }).extend(
  scenarioFixtures({
    catalogs: {
      pets: {
        systemName: 'pets',
        catalogApiUrl: 'http://catalog.test',
        selection: { latest: true },
      },
    },
  }),
);
export function checkTypes() {
  test.use({ scenarioReplayPolicy: 'error' });
  test('inference', async ({ catalogs, replay, custom }) => {
    custom.toUpperCase();
    await catalogs.get('pets', 'read');
    // @ts-expect-error Unknown catalog alias.
    await catalogs.get('other', 'read');
    const handles = await replay.replace({ read: { catalog: 'pets', id: 'read' } });
    handles.read.assertUsed();
    // @ts-expect-error Only selected handles are returned.
    handles.missing.assertUsed();
    // @ts-expect-error Unknown replacement catalog alias.
    await replay.replace({ read: { catalog: 'other', id: 'read' } });
  });
  test.fail.only('native modifier inference', async ({ replay }) => {
    const handles = await replay.replace({ read: { catalog: 'pets', id: 'read' } });
    handles.read.calls();
    // @ts-expect-error Modifiers preserve handle types.
    handles.other.calls();
  });
}
