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

Playwright drives the full Angular app while
[`@response-capture/scenario-client`](../../packages/scenario-client/README.md) replays
exchanges from catalog-api for system `petstore-api`. The adapter uses public Playwright routing;
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

Playwright global setup starts a local snapshot loader. A test or hook explicitly awaits
`replay.replace()` to activate recorded responses before sending requests. Only
requested catalog sources are fetched and validated with the shared contracts
package. Each catalog API URL/system/selection combination is fetched
once on first use; all workers and retries reuse that payload. Snapshots are saved
under `test-results/catalog/<run-id>/<source-hash>.json`. Latest is resolved on
first use of that source, rather than at suite discovery time. A new test run
fetches fresh snapshots.

Loaded sources are runtime report annotations. Skipped tests do not fetch catalogs.
The HTML report includes each fetched snapshot, source name, system, requested selector
(`null` for latest), URL, SHA-256 digest, and request diagnostics with phase numbers.
The API returns catalog payloads without resolved commit metadata; the digest
identifies the exact payload. Failed browser tests retain screenshots and traces
under `test-results/playwright`; open the report with:

```sh
npm exec --workspace=@response-capture/petstore-ui -- playwright show-report
```

### Authoring a journey

Import the application's native extended `test` and select exchanges inside the
callback. `expect` remains Playwright's ordinary assertion API. Petstore's fixture
module owns catalog selection, routing defaults, strict replay, and external image
failures; the reusable package contains none of those application policies.

```ts
import type { PetInput } from '@response-capture/contracts/petstore';
import { test, expect } from './support/fixtures';

test('create a pet', async ({ page, replay }) => {
  const { create, detail } = await replay.replace({
    create: { catalog: 'pets', id: 'pet.create.success' },
    detail: { catalog: 'pets', id: 'pet.read.after-order-deletion' },
  });
  const input = create.request.body as unknown as PetInput;
  await page.goto('/pets/new');
  await page.getByLabel('Name', { exact: true }).fill(input.name);
  await page.getByLabel('Photo URLs (optional)').fill(input.photoUrls.join('\n'));
  await page.getByRole('button', { name: 'Save pet' }).click();
  await expect(page.getByRole('heading', { name: input.name, exact: true })).toBeVisible();
  expect(create.calls()[0]?.body).toMatchObject({ name: input.name });
  detail.assertUsed();
});
```

For later steps, `await replay.replace({...})` switches the entire active set and
returns new named handles, retaining request history. Every activation must be
used. Examples are copies of independent provider recordings; choose coherent
follow-up exchanges rather than assuming replay simulates backend state.

For client-only validation, `await replay.replace({})` and assert
`expect(replay.requests()).toEqual([])`. Strict guarding requires no catalog fetch
when no examples are selected. For data-only access, request `catalogs` and call
`await catalogs.get('pets', 'pet.create.success')`; it installs no replay routes.

Native hooks and modifiers work without a declaration wrapper or private
Playwright APIs. If a hook navigates, select scenarios in that hook before
navigation, or use a native fixture dependency. See the
[package guide](../../packages/scenario-client/README.md) for incremental adoption,
mixed legacy mocks/live calls, multiple catalogs, origins/prefixes, snapshots,
and fixture composition. Register Petstore system routing in
`e2e/support/systems.ts`; additional applications supply their own configuration.

The initial suite covers populated/empty lists, inventory, creation, required-name
validation, missing pets, successful deletion, and deletion conflicts. Browser axe
checks include contrast and representative confirmation panels. Query-based filters
and order journeys remain future work: catalog v1 does not record query inputs.

Application support checks can run without catalog-api. The reusable package
suite runs its own catalog and browser acceptance harness:

```sh
npm run test:e2e:harness --workspace=@response-capture/petstore-ui
npm test --workspace=@response-capture/scenario-client
```

In CI, publish the desired provider catalog first, install Chromium (use Playwright's
`install --with-deps chromium` on Linux runners), then run `test:e2e:ui` with
`CATALOG_API_URL` and `CI` set; set `CATALOG_SELECTOR` to pin a commit or alias, or
omit it to use latest. Preserve `playwright-report/`
and `test-results/` as artifacts. These browser tests verify UI behavior against
recorded examples; provider integration tests continue to verify backend behavior.
