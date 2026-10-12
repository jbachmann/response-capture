# Add consumer-owned Petstore contract tests

## Summary

Create `apps/petstore-ui/contract/` with a standalone Node/Vitest suite that checks provider catalog examples against consumer-owned Zod contracts. Cover all 13 `PetstoreApiService` operations, including filter query parameters.

Each run loads one catalog, verifies required scenarios exist, and checks their HTTP methods, endpoints, request shapes, response statuses, and response shapes. Incompatible provider catalog updates fail the suite.

Existing browser tests, application behavior, and documentation remain unchanged.

## Consumer contracts and coverage

- Keep Zod schemas, scenario expectations, loading helpers, and tests inside the new folder. Add Zod `4.3.6` as an explicit UI development dependency, matching the installed version.
- Author schemas independently from provider DTOs and shared Petstore types. Define required fields, nested objects, arrays, enums, optional fields, positive safe integer IDs/quantities, nonnegative inventory counts, and ISO shipping timestamps.
- Accept additional payload fields. Validate without coercion, defaults, or transformations that could conceal incompatible data. Use Zod’s object and validation APIs. [Zod API documentation](https://zod.dev/api)
- Declare expectations against explicit stable scenario IDs. Missing IDs fail; unrelated scenarios remain outside this consumer’s requirements.
- Match parameterized endpoints by route structure and positive safe integer IDs, without depending on recorded IDs, names, dates, or array ordering.

| Operations | Required examples and checks |
|---|---|
| List pets | Empty and populated `Pet[]`, GET `/pet`, 200 |
| Filter by status/tag | Single-parameter query shapes, populated `Pet[]`, matching filter endpoint, 200 |
| Read pet | Basic and nested `Pet` shapes, GET `/pet/{id}`, 200; missing record, 404 |
| Create pet | Minimal/defaulted and fully populated requests, POST `/pet`, 201 `Pet`; invalid request, 400 |
| Replace pet | Minimal/defaulted and complete replacement requests, PUT `/pet`, 200 `Pet`; missing record, 404 |
| Delete pet | DELETE `/pet/{id}`, 204/null; missing record, 404; referenced pet, 409 |
| Inventory | Empty and populated `Inventory`, GET `/store/inventory`, 200 |
| Create order | Defaulted and quantity/shipping requests, POST `/store/order`, 201 `Order`; missing pet, 404 |
| List orders | Empty and populated `Order[]`, GET `/store/order`, 200 |
| Read order | Basic and shipping-date `Order` shapes, GET `/store/order/{id}`, 200; missing record, 404 |
| Delete order | DELETE `/store/order/{id}`, 204/null; missing record, 404 |
| Seed | POST `/training/seed`, null request, 200 `SeedResult` |

Validate bodyless requests as `null`. Give defaulted request examples separate schemas from complete requests. For error scenarios, assert the expected status and endpoint; the UI does not consume error-body fields, so those fields impose no consumer contract.

## Catalog format and provider captures

- Extend `RequestExample` with optional `query?: Record<string, string[]>`. Store decoded query values, preserving repeated-value order. Omit the property when there are no parameters; keep `path` as the concrete pathname.
- Update shared validation to accept only an object of nonempty string arrays, allowing empty string values as legitimate recorded input. Existing catalogs without `query` remain readable.
- Update the recorder to capture query parameters from the observed request rather than rejecting query strings. Preserve fragment rejection and existing capture/publication safeguards.
- Retain wire version 1 for this additive repository-local extension. Rebuild shared readers before publishing catalogs containing `query`; older strict readers reject that new field. Existing replay behavior remains query-agnostic.
- Add passing provider tests/capture markers for these stable IDs:
  - `pet.filter.by-status.success`
  - `pet.filter.by-tags.success`
  - `store.order.list.empty`
  - `store.order.list.success`
  - `pet.replace.complete`
  - `store.order.create.with-shipping`
- Use requests matching what the UI sends for the new filter, replacement, and order-creation examples. Preserve existing IDs and assertions.

## Loading and execution

- Add dedicated contract Vitest configuration and a strict, no-emit TypeScript configuration, isolated from Angular and Playwright.
- Default to the latest `petstore-api` catalog using `CATALOG_API_URL`, defaulting to `http://localhost:3001`. Support the existing `CATALOG_SELECTOR` convention.
- Add `CONTRACT_CATALOG_PATH` for an explicit raw catalog file. Resolve relative paths from the UI workspace. File input takes precedence and performs no network lookup.
- Reuse shared catalog parsing and the existing data-only `fetchCatalog`/digest helpers. Load once in Vitest global setup and provide the same snapshot to every contract test.
- Save the snapshot and source metadata under an ignored, unique `test-results/contract/` run directory. Fail loading errors without fallback. Assertion failures identify the scenario, source/digest, and failing field.
- Add workspace `test:contract` and `test:contract:unit` scripts. The latter runs offline helper tests with supplied fixtures.
- Add root `npm run test:contract` through Turbo, with dependency builds, caching disabled, and the three catalog environment variables passed through. Keep it separate from ordinary `npm test`.

## Verification and acceptance

- Run the suite against a fresh complete provider capture, then against that catalog published through the existing submission workflow.
- Verify missing scenarios, changed methods/routes/statuses, missing query keys, incompatible nested fields, wrong enums, and invalid nullability fail with useful diagnostics.
- Verify additional payload fields, changed fixture values, and additional unrelated scenarios pass.
- Test malformed/unavailable catalogs, file precedence, selector handling, and one catalog load per run.
- Replace recorder tests that expect query rejection with capture tests covering repeated keys, encoded values, empty values, and queryless requests; retain publication-failure coverage using another unsupported exchange.
- Verify query-bearing catalog round trips through storage and shared readers. Run affected contracts, recorder, client, provider, and UI checks.

These tests verify recorded examples against consumer expectations. They do not establish the provider’s complete accepted input space or unrecorded behavior. Converting existing replay tests to consumer-owned mocks and authoring a new RFC are deferred.
