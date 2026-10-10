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

If the desired catalog has not yet been submitted, prepare it using the existing
provider recording workflow. Remove old generated recordings before starting a
fresh session; otherwise duplicate scenario IDs from previous runs prevent merging.
The provider tests start their own isolated application instances:

```sh
rm -rf apps/petstore-api/artifacts/api-scenarios
npm run test:e2e --workspace=@response-capture/petstore-api
npm run scenarios:merge
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

The setup project fetches `/catalogs/petstore-api` for latest, or
`/catalogs/petstore-api/:selector` when a selector is supplied, once and validates the
catalog with the shared contracts package, and saves it under
`test-results/catalog/<run-id>/catalog.json`. Workers and retries read this snapshot.
The HTML report includes the catalog, URL, selector (`null` for latest), SHA-256 digest, and request
diagnostics. Failed browser tests retain screenshots and traces under
`test-results/playwright`; open the report with:

```sh
npm exec --workspace=@response-capture/petstore-ui -- playwright show-report
```

### Authoring a journey

Import `test` and `expect` from `e2e/support/fixtures`. Activate scenario IDs
before navigation or the action that triggers an HTTP call:

```ts
import type { PetInput } from '@response-capture/contracts/petstore';
import { test, expect } from './support/fixtures';

test('create a pet', async ({ page, catalog, scenarios }) => {
  const create = catalog.get('pet.create.success');
  const input = create.request.body as unknown as PetInput;
  scenarios.use(create.id, 'pet.read.after-order-deletion');
  await page.goto('/pets/new');
  await page.getByLabel('Name', { exact: true }).fill(input.name);
  await page.getByLabel('Photo URLs (optional)').fill(input.photoUrls.join('\n'));
  await page.getByRole('button', { name: 'Save pet' }).click();
  await expect(page.getByRole('heading', { name: input.name, exact: true })).toBeVisible();
  await expect(page.getByRole('status')).toHaveText('Pet saved.');
  scenarios.assertUsed(create.id, 'pet.read.after-order-deletion');
});
```

`catalog.get(id)` returns an independent copy of the recording.
`scenarios.use(...ids)` replaces the active responses without clearing previous
request history. For example, after loading a detail page, select
`pet.delete.success`, `pet.list.empty`, and `store.inventory.empty` before confirming
deletion. Choose coherent recordings: `pet.read.after-order-deletion` currently
matches the pet returned by `pet.create.success`, whereas `pet.read.success`
describes a different sold variant.

Handlers match the UI origin, HTTP method, and recorded concrete path. Explicit
`request.match.bodyContains` hints use the shared recursive subset matcher;
request examples alone do not impose an exact payload constraint. Recorded response
status, body, and content type are preserved, including empty 204 responses.
`scenarios.calls(id)` returns matched request bodies and URLs across all phases;
`scenarios.assertUsed(...ids)` allows immediate usage assertions.

Teardown fails for unused selections in any phase, body-hint failures, or unmatched
`/pet`, `/store`, and `/training` requests. Those unmatched requests abort rather
than reach a real API. Select at most one scenario per method/path in each phase.
External image requests fail deterministically to exercise the photo fallback;
same-origin application assets load normally. Each test gets its own browser
context and handlers.

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
