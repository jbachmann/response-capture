# Scenario client

Read recorded API examples and optionally replay selected exchanges in ordinary
Playwright tests. Existing assertions, hooks, modifiers, and custom fixtures keep
their native behavior. Adopt one exchange or one test at a time.

This private workspace package targets Node 24. Playwright `^1.56.1` is an
optional peer; catalog-only consumers do not need Playwright or MSW.

## Entrypoints

| Import                                         | Responsibility                                                                                |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `@response-capture/scenario-client`            | Validated `ScenarioCatalog` lookup, types, routing, and transport-independent `ReplaySession` |
| `@response-capture/scenario-client/node`       | `fetchCatalog`, digest-verified snapshots, and a run-scoped snapshot broker                   |
| `@response-capture/scenario-client/playwright` | `scenarioFixtures` and `scenarioGlobalSetup`                                                  |

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

## Replay selected exchanges

```ts
test('create a pet', async ({ page, replay }) => {
  const { create, detail } = await replay.replace({
    create: { catalog: 'pets', id: 'pet.create.success' },
    detail: { catalog: 'pets', id: 'pet.read.after-order-deletion' },
  });
  // Use create.request.body as input, then perform your existing UI actions.
  await page.goto('/pets/new');
  // Fill and submit the form using your application's fields.
  // Keep existing assertions against the saved pet.
});
```

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
