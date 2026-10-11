import { test as base } from '@playwright/test';
import { scenarioFixtures } from '@response-capture/scenario-client/playwright';
import {
  scenarioReferences,
  ScenarioCatalog,
  type Json,
  type ReplaySession,
  type ScenarioExample,
  type TypedScenarioReference,
} from '@response-capture/scenario-client';

interface Input {
  name: string;
}
interface Pet {
  id: number;
  name: string;
}
type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
function expectType<T extends true>() {}

const pets = scenarioReferences('pets');
const definitions = {
  create: pets.define<Input, Pet>('create'),
  list: pets.define<null, Pet[]>('list'),
  empty: pets.define<null, null>('empty'),
  default: pets.define('read'),
  requestOnly: pets.define<Input>('create'),
};
const other = scenarioReferences('other').define<null, Pet>('read');

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

    expectType<Equal<typeof definitions.create.catalog, 'pets'>>();
    // @ts-expect-error Typed references must be created by the helper.
    const fabricated: TypedScenarioReference<Input, Pet, 'pets'> = {
      catalog: 'pets',
      id: 'create',
    };
    void fabricated;
    const typed = await catalogs.get(definitions.create);
    expectType<Equal<typeof typed.request.body, Input>>();
    expectType<Equal<typeof typed.response.body, Pet>>();
    typed.source.sha256.toUpperCase();
    // @ts-expect-error Typed references still require a configured alias.
    await catalogs.get(other);
    // @ts-expect-error Plain reference lookup also checks the alias.
    await catalogs.get({ catalog: 'other', id: 'read' });
    const plain = await catalogs.get({ catalog: 'pets', id: 'read' });
    const legacy = await catalogs.get('pets', 'read');
    expectType<Equal<typeof plain.request.body, Json>>();
    expectType<Equal<typeof plain.response.body, Json>>();
    expectType<Equal<typeof legacy.response.body, Json>>();

    const mixed = await replay.replace({
      create: definitions.create,
      list: definitions.list,
      empty: definitions.empty,
      default: definitions.default,
      requestOnly: definitions.requestOnly,
      legacy: { catalog: 'pets', id: 'read' },
    });
    expectType<Equal<typeof mixed.create.request.body, Input>>();
    expectType<Equal<typeof mixed.create.response.body, Pet>>();
    expectType<Equal<typeof mixed.list.request.body, null>>();
    expectType<Equal<typeof mixed.list.response.body, Pet[]>>();
    expectType<Equal<typeof mixed.empty.response.body, null>>();
    expectType<Equal<typeof mixed.default.request.body, Json>>();
    expectType<Equal<typeof mixed.default.response.body, Json>>();
    expectType<Equal<typeof mixed.requestOnly.request.body, Input>>();
    expectType<Equal<typeof mixed.requestOnly.response.body, Json>>();
    expectType<Equal<typeof mixed.legacy.response.body, Json>>();
    const observed = mixed.create.calls();
    expectType<Equal<(typeof observed)[number]['body'], Json>>();
    // @ts-expect-error Incoming requests are not proven to match application types.
    const incoming: Input = observed[0]!.body;
    // @ts-expect-error Request and response bodies keep their separate declared types.
    const invalidResponse: Pet = mixed.create.request.body;
    // @ts-expect-error JSON bodies cannot be assigned application types automatically.
    const invalidLegacy: Pet = mixed.legacy.response.body;
    void [incoming, invalidResponse, invalidLegacy];
    // @ts-expect-error Only selected handle names exist.
    mixed.missing.assertUsed();
    // @ts-expect-error Typed replacement references require a configured alias.
    await replay.replace({ other });
  });
  test.fail.only('native modifier inference', async ({ replay }) => {
    const handles = await replay.replace({ read: definitions.create });
    handles.read.calls();
    expectType<Equal<typeof handles.read.response.body, Pet>>();
    // @ts-expect-error Modifiers preserve handle types.
    handles.other.calls();
  });
}

export function checkCoreTypes(
  session: ReplaySession,
  create: ScenarioExample<Input, Pet>,
  list: ScenarioExample<null, Pet[]>,
  empty: ScenarioExample<null, null>,
  legacy: ScenarioExample,
) {
  const handles = session.replace({ create, list, empty, legacy });
  expectType<Equal<typeof handles.create.request.body, Input>>();
  expectType<Equal<typeof handles.create.response.body, Pet>>();
  expectType<Equal<typeof handles.list.response.body, Pet[]>>();
  expectType<Equal<typeof handles.empty.request.body, null>>();
  expectType<Equal<typeof handles.empty.response.body, null>>();
  expectType<Equal<typeof handles.legacy.response.body, Json>>();
  // @ts-expect-error Portable replay also preserves selected handle names.
  handles.missing.calls();
  const catalog = new ScenarioCatalog({ catalogVersion: 1, scenarios: [] }, 'pets');
  const example = catalog.get('read');
  expectType<Equal<typeof example.response.body, Json>>();
}
