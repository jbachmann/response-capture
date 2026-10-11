# Scenario client

Read recorded API examples and optionally replay selected exchanges in ordinary
Playwright tests. Existing assertions, hooks, modifiers, and custom fixtures keep
their native behavior. Adopt one exchange or one test at a time.

This private workspace package targets Node 24. Playwright `^1.56.1` is an
optional peer; catalog-only consumers do not need Playwright or MSW.

## Entrypoints

| Import                                         | Responsibility                                                                                           |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `@response-capture/scenario-client`            | Validated `ScenarioCatalog` lookup, typed references, routing, and transport-independent `ReplaySession` |
| `@response-capture/scenario-client/node`       | `fetchCatalog`, digest-verified snapshots, and a run-scoped snapshot broker                              |
| `@response-capture/scenario-client/playwright` | `scenarioFixtures` and `scenarioGlobalSetup`                                                             |

The root entrypoint has no Node, Playwright, or MSW imports. Importing any
entrypoint does not start services or fetch catalogs. Capture and submission
remain separate responsibilities of provider projects.

## Add to an existing Playwright suite

Build the contracts and client from the repository root:

```sh
npm run build --workspace=@response-capture/contracts
npm run build --workspace=@response-capture/scenario-client
```

Extend your existing test object in an application-owned fixture module:

```ts
import { test as base } from '@playwright/test'; // Or your existing custom test.
import { scenarioFixtures } from '@response-capture/scenario-client/playwright';

export const test = base.extend(
  scenarioFixtures({
    catalogs: {
      pets: {
        catalogApiUrl: 'http://localhost:3001',
        systemName: 'petstore-api',
        selection: { latest: true },
        routing: { origin: 'ui', protectedPaths: ['/pet', '/store', '/training'] },
      },
    },
  }),
);
```

`catalogApiUrl` is explicit. Choose `{ latest: true }` or
`{ selector: 'main' }`; a selector can be an alias or commit. Environment variable
interpretation and system registries belong to the consuming application.
The `'ui'` routing origin resolves to Playwright's `baseURL` origin. Explicit
HTTP(S) origins and `pathPrefix` support other systems. `protectedPaths` refers
to recorded API roots before the prefix is applied; `'/'` protects the whole
origin/prefix. Routing is optional for data-only sources.

Export the package setup helper from a global setup module:

```ts
// e2e/global-setup.ts
import { scenarioGlobalSetup } from '@response-capture/scenario-client/playwright';
export default scenarioGlobalSetup({ outputDirectory: 'test-results/catalog' });
```

Register it in your existing Playwright configuration:

```ts
import { defineConfig } from '@playwright/test';
export default defineConfig({
  globalSetup: './e2e/global-setup.ts',
  use: { baseURL: 'http://localhost:4200', serviceWorkers: 'block' },
});
```

Existing setup can compose with the returned function: await it alongside the
application's setup and call its returned teardown during cleanup. Alternatively,
`startCatalogRun({ outputDirectory })` from `/node` returns `{ directory, close }`
for explicit lifecycle management. Relative output paths resolve from the
command's working directory. Each setup creates a fresh UUID directory.

## Read data without installing mocks

```ts
import { expect } from '@playwright/test';
import { test } from './fixtures';

test('inspect an example', async ({ catalogs }) => {
  const example = await catalogs.get('pets', 'pet.create.success');
  expect(example.response.status).toBe(201);
});
```

`catalogs.get()` loads only the requested source and returns the full recording
plus `source` provenance. Every example is an independent copy. It needs no page,
browser, or routing configuration. Tests that do not request either fixture
perform no catalog fetching or package routing.

Outside Playwright, `fetchCatalog(baseUrl, source)` returns a `CatalogSnapshot`;
construct `new ScenarioCatalog(snapshot.catalog, source.systemName)` to look up
examples. This standalone path does not require global setup or a broker.

## Declare application body types once

Use `scenarioReferences()` in an application-owned module to bind a catalog alias
and scenario IDs to your request and response types:

```ts
// e2e/support/scenarios.ts
import type { Inventory, Pet, PetInput } from '@response-capture/contracts/petstore';
import { scenarioReferences } from '@response-capture/scenario-client';

// The API makes status and tags optional on create, supplying defaults when omitted.
type CreatePetRequest = Omit<PetInput, 'status' | 'tags'> &
  Partial<Pick<PetInput, 'status' | 'tags'>>;

const pets = scenarioReferences('pets');
export const petScenarios = {
  create: pets.define<CreatePetRequest, Pet>('pet.create.success'),
  detail: pets.define<null, Pet>('pet.read.after-order-deletion'),
  list: pets.define<null, Pet[]>('pet.list.success'),
  inventory: pets.define<null, Inventory>('store.inventory.with-order'),
  remove: pets.define<null, null>('pet.delete.success'),
};
```

Defining a reference performs no catalog fetching or routing. References are
ordinary `{ catalog, id }` objects at runtime. The catalog alias must match a
configured source; scenario IDs remain strings and are checked at lookup time.
Both body types default to `Json` when omitted.

The declarations are trusted application types, not runtime payload validators.
Catalog structure and JSON validation remain active, but the package does not
check whether a recorded body matches `Pet` or another declared application
type. Ordinary interfaces work without JSON index signatures.

Data-only lookup infers the same types without installing mocks:

```ts
const example = await catalogs.get(petScenarios.create);
const input = example.request.body; // CreatePetRequest
const saved = example.response.body; // Pet
```

The existing `catalogs.get('pets', 'pet.create.success')` form and plain reference
objects continue returning JSON. Every lookup returns an independent example
with provenance. `ScenarioExample<RequestBody, ResponseBody>` and
`ScenarioHandle<RequestBody, ResponseBody>` default to JSON and can also carry
application types through the portable `ReplaySession.replace()` API.
Standalone `ScenarioCatalog.get(id)` returns JSON bodies. Observed requests,
including `calls()` bodies, always remain JSON because incoming traffic is not
proven to have the declared application shape.

## Replay selected exchanges

```ts
import { petScenarios } from './support/scenarios';

test('create a pet', async ({ page, replay }) => {
  const { create, detail } = await replay.replace({
    create: petScenarios.create,
    detail: petScenarios.detail,
  });
  const input = create.request.body; // CreatePetRequest
  const saved = create.response.body; // Pet
  await page.goto('/pets/new');
  await page.getByLabel('Name', { exact: true }).fill(input.name);
  await page.getByLabel('Photo URLs (optional)').fill(input.photoUrls.join('\n'));
  await page.getByRole('button', { name: 'Save pet' }).click();
  await expect(page).toHaveURL(`/pets/${saved.id}`);
  create.assertUsed();
  detail.assertUsed();
});
```

Typed and plain references may coexist in one replacement. Migrate only the
scenarios whose bodies you want to use, keeping existing mocks and assertions.

Await selection before the action that sends requests. If a `beforeEach` hook
navigates, select inside that hook before navigation, or introduce a native
fixture dependency that selects and then navigates. Selecting in a later test
body cannot mock requests that have already happened.

Each `replace()` replaces the entire active set, returning exactly the named
handles. A handle exposes the recording, provenance, `calls()`, and
`assertUsed()`. Later replacements preserve history. Calls accumulate for a
catalog alias/scenario ID across phases; `assertUsed()` checks that handle's own
activation. Failed replacements leave the active set intact.

Every selected activation must be exercised before teardown, including earlier
phases. Repeated calls to an active scenario replay the same response. Recordings
come from independent provider tests; choose coherent examples for multi-step
journeys. Replay does not simulate backend state.

The default `scenarioReplayPolicy: 'fallback'` handles only selected exchanges.
Other requests reach existing Playwright handlers or the live network. To guard
all configured API boundaries:

```ts
test.describe('isolated catalog journeys', () => {
  test.use({ scenarioReplayPolicy: 'error' });
  test('client-only validation', async ({ page, replay }) => {
    await replay.replace({});
    await page.goto('/pets/new');
    // Exercise client-side validation.
    expect(replay.requests()).toEqual([]);
  });
});
```

Strict mode requires routing for every configured source and blocks unmatched
requests to their protected paths, even if their catalogs have not been fetched.
Unrelated traffic still falls through. Fixtures remain lazy in either mode.

Replay matches exact methods and concrete paths after applying origin/prefix.
Only explicit `request.match.bodyContains` hints constrain JSON request bodies;
example bodies alone do not require exact equality. A selected route with invalid
JSON, a failed body hint, or query parameters aborts and fails verification in
both policies. Catalog v1 does not model queries. One active scenario may handle
each method/URL; ambiguous selections fail before changing the current phase.
Response status, JSON body, content type, and empty HEAD/204/205/304 responses
are preserved.

The adapter uses public, page-scoped Playwright routing. Existing handlers
registered earlier remain available through `route.fallback()`. Native routing
precedence still applies: later page handlers can shadow replay, and page handlers
precede context handlers. Remove or narrow conflicting legacy mocks when adopting
an exchange. Cleanup removes only the package's own handler. Other pages, popups,
Playwright's `request` fixture, and Node HTTP clients are outside this adapter's
interception scope.

## Snapshots and diagnostics

The parent-process broker fetches each catalog URL/system/selection combination
once on first use. All workers and retries reuse that payload and its SHA-256
digest. Loading failures are memoized for the run. New runs fetch fresh data;
latest and mutable aliases are frozen when first requested, not during discovery.

Snapshots are retained under `<outputDirectory>/<uuid>/<source-hash>.json`.
Each consuming test attaches its loaded snapshots and source annotations. Replay
attaches phases, source provenance, requests, and violations on both success and
failure. Verification occurs after test hooks. Skipped tests retain native
locations and annotations and do not load catalog data.

Catalog responses currently provide no resolved commit metadata. Provenance
records the requested selector (`null` for latest), URL, system, alias, and exact
payload digest; it does not infer the resolved commit.

## Verify

```sh
npm test --workspace=@response-capture/scenario-client
```

Tests exercise built entrypoints and declarations, replay semantics, snapshot
integrity, and real Playwright workers/retries using a synthetic catalog service.
Install the project's Chromium version once with `playwright install chromium`.
The acceptance checks require localhost sockets and permission to launch Chromium.
