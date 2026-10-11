# Petstore UI

Angular application for browsing pets and managing their orders.

## Development

From the repository root, use Node.js 24 and npm 11.8.0:

```sh
nvm use
npm ci
npm run dev --workspace=@response-capture/petstore-api
npm run dev --workspace=@response-capture/petstore-ui
```

Open http://localhost:4200/. `npm run dev` starts all four applications together.
The install prepares shared contracts; both UI builds compile the shared Angular
source package. See the [workspace README](../../README.md) for checks and layout.

## Petstore

The root route redirects to `/pets`. Navigation links Pets and Orders. The
Scenario library is hosted separately in [catalog-ui](../catalog-ui/README.md).
The petstore-ui and petstore-api must both be running; the petstore-ui uses the petstore-api's
real data, with no local mock fallback. The former `/scenarios` URL redirects to
`/pets`.

- Browse pets and inventory, search names, and filter by status and exact tag.
  Status changes apply immediately; use **Apply filters** or Enter to apply a tag.
  Combined filters intersect the petstore-api results; name search is local.
- Add, edit, and delete pets. Name is required; photos, category, and tags are
  optional. Add photo URLs one per line. Editing preserves existing category/tag
  IDs and unchanged photo arrays; removing a tag or clearing a named category
  deliberately removes it. Only HTTP/HTTPS photos are displayed, with a fallback
  for missing or broken images.
- Order available pets with a positive whole-number quantity and an optional
  shipping date in local time. The petstore-ui rechecks availability before ordering.
  The API still permits ordering any status; this UI restriction is not a server
  guarantee. Order operations never change pet status.
- **Orders** lists all saved orders, newest first, with links to order and pet
  details. Refresh the list to see updates from other users. ID lookup remains
  available, and orders can be deleted after confirmation from their detail page.
  The list comes from `GET /store/order` and includes training/demo orders.
  Delete referencing orders before deleting a pet.
- When inventory is empty, **Load demo data** offers a confirmed training reset.
  It replaces all pets and orders, including records another user may have added
  since the page loaded. Seeding is never automatic. Database clearing is not
  exposed by the UI.

The development proxy forwards `/pet`, `/pet/**`, `/store/**`, and `/training/**`
to `http://localhost:3000`. In production, forward these API paths to the petstore-api
on the same origin and serve the Angular `index.html` for petstore-ui paths including
`/pets`, `/pets/new`, `/pets/:id`, `/pets/:id/edit`, `/orders`, and `/orders/:id`.
Never apply the Angular fallback to API paths.

Run `npm test --workspace=@response-capture/petstore-ui` and
`npm run build --workspace=@response-capture/petstore-ui` from the repository root.
Petstore unit tests cover HTTP contracts, filter cancellation/intersection, edit
preservation, order eligibility, validation, confirmations, failures, and axe
WCAG A/AA DOM checks. Browser checks are also needed for contrast and layout.

## Catalog-backed browser tests

Playwright drives the full Angular app while `@msw/playwright` replays exchanges
from catalog-api for system `petstore-api`. The adapter uses Playwright routing;
there is no MSW service worker script or mock startup code in the application.
The test server runs at `http://localhost:4202` with its API proxy disabled.
Petstore-api does not need to be running for these browser tests.

Install Chromium once after installing dependencies:

```sh
npm exec --workspace=@response-capture/petstore-ui -- playwright install chromium
```

Start catalog-api in another terminal:

```sh
npm run dev --workspace=catalog-api
```

If the desired catalog has not yet been submitted, capture and submit it from
the repository root. Capture starts isolated API instances and needs no cleanup
of previous recordings:

```sh
npm run scenarios:capture
npm run scenarios:submit
```

Run the browser suite against that submission:

```sh
npm run test:e2e:ui
```

An unset, empty, or whitespace-only `CATALOG_SELECTOR` selects the latest
`petstore-api` catalog. Set it to select an exact alias or commit hash:

```sh
CATALOG_SELECTOR="$(git rev-parse HEAD)" npm run test:e2e:ui
```

`CATALOG_API_URL` defaults to `http://localhost:3001`; override it to consume a
catalog service elsewhere. Prefer commits in CI. Aliases can move, and the service
can replace a submission for the same commit; the saved snapshot records the
exact payload used by each run. The UI command does not generate or submit catalogs.

Playwright global setup starts a local snapshot loader. Before a test's hooks and
body run, its declared catalog sources are fetched and validated with the shared
contracts package. Each catalog API URL/system/selection combination is fetched
once on first use; all workers and retries reuse that payload. Snapshots are saved
under `test-results/catalog/<run-id>/<source-hash>.json`. Latest is resolved on
first use of that source, rather than at suite discovery time. A new test run
fetches fresh snapshots.

Declarations are report annotations, including for skipped tests. The HTML report
also includes each fetched snapshot, source name, system, requested selector
(`null` for latest), URL, SHA-256 digest, and request diagnostics with phase numbers.
The API returns catalog payloads without resolved commit metadata; the digest
identifies the exact payload. Failed browser tests retain screenshots and traces
under `test-results/playwright`; open the report with:

```sh
npm exec --workspace=@response-capture/petstore-ui -- playwright show-report
```

### Authoring a journey

Import `test` and `expect` from `e2e/support/fixtures`. Declare the system, catalog
selection, and named scenarios in the test. These responses are automatically
active before `beforeEach` and the callback run; reading a handle never changes
handlers.

```ts
import type { PetInput } from '@response-capture/contracts/petstore';
import { test, expect, catalogSelectionFromEnv } from './support/fixtures';

test(
  'create a pet',
  {
    catalogs: {
      pets: { systemName: 'petstore-api', selection: catalogSelectionFromEnv() },
    },
    scenarios: {
      create: { catalog: 'pets', id: 'pet.create.success' },
      detail: { catalog: 'pets', id: 'pet.read.after-order-deletion' },
    },
  },
  async ({ page, scenarios: { create, detail } }) => {
    const input = create.request.body as unknown as PetInput;
    await page.goto('/pets/new');
    await page.getByLabel('Name', { exact: true }).fill(input.name);
    await page.getByLabel('Photo URLs (optional)').fill(input.photoUrls.join('\n'));
    await page.getByRole('button', { name: 'Save pet' }).click();
    await expect(page.getByRole('heading', { name: input.name, exact: true })).toBeVisible();
    await expect(page.getByRole('status')).toHaveText('Pet saved.');
    expect(create.calls()[0]?.body).toMatchObject({ name: input.name });
    detail.assertUsed();
  },
);
```

Editor completion exposes exactly the named handles. Each handle has `id`,
`request`, `response`, `source`, `calls()`, and `assertUsed()`. Examples are copies
of the recording. `source` identifies the declaration's catalog name plus the
system, selector, URL, and digest. `calls()` returns independent copies of matched
requests across phases for that catalog source and scenario ID. `assertUsed()`
checks the handle's own phase; an earlier call cannot satisfy a new activation.

Use `{ latest: true }` to explicitly select latest or `{ selector: 'main' }` for
an alias or commit. Explicit selections ignore `CATALOG_SELECTOR`.
`catalogSelectionFromEnv()` is the opt-in helper used by the pet journeys: it reads
that variable and defaults unset or blank values to latest. An optional
`catalogApiUrl` on a source overrides `CATALOG_API_URL` for that source.

For a later step, replace the entire active scenario set. Replacements return new
named handles and keep the earlier request history:

```ts
// After a detail scenario has been exercised:
const { remove } = mocks.replaceScenarios({
  remove: { catalog: 'pets', id: 'pet.delete.success' },
  list: { catalog: 'pets', id: 'pet.list.empty' },
  inventory: { catalog: 'pets', id: 'store.inventory.empty' },
});
await page.getByRole('button', { name: 'Delete pet' }).click();
await page.getByRole('button', { name: 'Confirm', exact: true }).click();
await expect(page.getByRole('heading', { name: 'No pets yet' })).toBeVisible();
remove.assertUsed();
```

Choose coherent recordings: `pet.read.after-order-deletion` currently matches the
pet returned by `pet.create.success`, whereas `pet.read.success` describes a
different sold variant. Catalogs contain exchanges from independent provider
tests; the harness does not synthesize database state.

Declare `scenarios: {}` for client-only validation and assert
`expect(mocks.requests()).toEqual([])`. Declared systems' API paths remain guarded
even when they have no active scenarios.

### Adding another system or using multiple catalogs

Register its routing in `e2e/support/systems.ts`. The registry defines routing,
while each test declares its catalog selection. `'ui'` means the Playwright
`baseURL` origin. Protected paths refer to the recorded paths before the prefix is
applied; `'/'` protects the entire bound origin/prefix.

```ts
export const systems = {
  'petstore-api': { origin: 'ui', protectedPaths: ['/pet', '/store', '/training'] },
  'accounts-api': {
    origin: 'ui',
    pathPrefix: '/accounts',
    protectedPaths: ['/account'],
  },
};
```

A test can also supply `catalogs.<name>.routing` to override the registry, including
for a system not yet registered. A missing binding fails with registration
instructions. Separate origins, such as `http://accounts.test`, are supported;
the UI's request URLs must agree with the declared routing.

```ts
test(
  'display the pet and account',
  {
    catalogs: {
      pets: { systemName: 'petstore-api', selection: { latest: true } },
      accounts: {
        systemName: 'accounts-api',
        selection: { selector: 'main' },
        routing: { origin: 'ui', pathPrefix: '/accounts', protectedPaths: ['/account'] },
      },
    },
    scenarios: {
      pet: { catalog: 'pets', id: 'pet.read.success' },
      account: { catalog: 'accounts', id: 'account.read.success' },
    },
  },
  async ({ page, scenarios }) => {
    // Trigger both requests using the application that integrates these systems.
    // /pet/1 uses pets; /accounts/account/1 uses accounts when those are recorded paths.
  },
);
```

This illustrates declaration syntax; the callback must exercise both scenarios.
Catalog names distinguish identical scenario IDs across sources. Multiple versions
of the same system can also be declared, with distinct routing to avoid collisions.
Scenario references and replacements must use a declared catalog name. Another
system's catalog must use the existing shared scenario schema.

Handlers match HTTP method and concrete URL after applying origin and prefix.
Explicit `request.match.bodyContains` hints use the shared recursive subset
matcher; request examples alone do not impose an exact payload constraint.
Recorded response status, body, and content type are preserved, including empty
204 responses. Teardown fails for unused activations in any phase, body-hint
failures, or unmatched API requests. At most one active recording can handle a
method/URL; collisions identify both sources and scenarios. Failed replacements
leave the current handlers intact.

Unmatched requests to a declared system's protected paths abort. External image
requests fail deterministically to exercise the photo fallback; same-origin
application assets load normally. Each test gets a fresh browser context and
handlers. Ordinary `test.describe`, hooks, `test.use`, tags, grep filtering,
`test.only`, `test.skip`, `test.fixme`, and `test.fail` remain available.
The declaration wrapper preserves test source locations through a small bridge to
the pinned Playwright version; run the acceptance checks when upgrading Playwright.

The initial suite covers populated/empty lists, inventory, creation, required-name
validation, missing pets, successful deletion, and deletion conflicts. Browser axe
checks include contrast and representative confirmation panels. Query-based filters
and order journeys remain future work: catalog v1 does not record query inputs.

Harness checks can run without catalog-api:

```sh
npm run test:e2e:harness --workspace=@response-capture/petstore-ui
```

In CI, publish the desired provider catalog first, install Chromium (use Playwright's
`install --with-deps chromium` on Linux runners), then run `test:e2e:ui` with
`CATALOG_API_URL` and `CI` set; set `CATALOG_SELECTOR` to pin a commit or alias, or
omit it to use latest. Preserve `playwright-report/`
and `test-results/` as artifacts. These browser tests verify UI behavior against
recorded examples; provider integration tests continue to verify backend behavior.
