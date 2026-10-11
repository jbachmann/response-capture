# API scenario recorder

Test-only tooling for recording concrete JSON request/response examples. The
core uses `@response-capture/contracts/scenarios`; HTTP observation, Supertest
marking, Vitest lifecycle integration, and file output have separate entrypoints.
Requires Node 24. The initial adapters support Vitest 4.1.11+ in version 4 and
Supertest 7.3.1+ in version 7. Interceptors is pinned to the verified version 0.39.8.

## Author tests normally

```ts
import request from 'supertest';
import { capture } from '@response-capture/scenario-recorder/supertest';

it('creates a pet', async () => {
  const response = await request(app.getHttpServer())
    .post('/pet')
    .send({ name: 'Milo', photoUrls: [] })
    .use(
      capture('pet.create.success', {
        title: 'Create a pet with defaults',
        category: 'Pets',
        group: 'Create a pet',
        description: 'Creates Milo with the default available status.',
        tags: ['defaults'],
        requestMatch: { bodyContains: { name: 'Milo' } },
      }),
    )
    .expect(201);

  expect(response.body.status).toBe('available');
});
```

Keep native Supertest request chains and normal assertions. Mark only exchanges
you want in the catalog, and await them. Assertions may follow the request;
there is no assertion callback or manual flush. Unmarked setup requests are
excluded. Markers are inert in ordinary runs, including metadata validation.
Production application code requires no changes or recorder imports.

## Enable a dedicated capture run

Build the workspace dependencies first. Extend your existing E2E config:

```ts
// vitest.config.capture.ts
import { defineConfig, mergeConfig } from 'vitest/config';
import { scenarioCapture } from '@response-capture/scenario-recorder/vitest';
import e2e from './vitest.config.e2e.js';

export default mergeConfig(
  e2e,
  defineConfig({
    test: scenarioCapture({ outputDirectory: 'artifacts/api-scenarios' }),
  }),
);
```

Run `vitest run --config vitest.config.capture.ts`. `scenarioCapture` returns
test configuration with a setup file and both the default and capture reporters.
Relative output directories resolve from the command's working directory.
Use the existing E2E configuration for ordinary runs. Do not add the capture
setup file to ordinary test configuration. Use one output directory per
independent capture command; workers within a command are supported.

For this repository, from the root:

```sh
npm run test:e2e         # normal tests, no capture
npm run scenarios:capture
```

Capture writes `apps/petstore-api/artifacts/api-scenarios/catalog.json` locally.
It requires no catalog API. After starting catalog-api, upload explicitly with
`npm run scenarios:submit`. Uploading, Git metadata, and Petstore identity belong
to the app's submission script.

## Capture and publication guarantees

The Supertest plugin associates the native request with the current test
attempt. The Node adapter uses Interceptors' public request/response events,
`getRawRequest()`, and request IDs to observe the serialized exchange. It
clones bodies before reading; custom JSON serialization and multiple `.send()`
calls are observed as actually sent. It adds no headers and never mocks a response.
The plugin guards unsupported methods on the marked instance and observes
Supertest's completion callback for rejected expectations.

Vitest's `aroundEach` establishes an `AsyncLocalStorage` session per attempt.
Snapshots travel to the coordinator through serializable test metadata. Only
the final successful attempt is eligible; skipped and expected-failure tests
are excluded. Concurrent tests and parallel workers use independent sessions.
Reopening an app during a test requires no recorder reinitialization.

The reporter writes only after the complete run passes, including test and suite
teardown and unhandled-error checks. A failed, interrupted, invalid, or duplicate-ID
run leaves the previous catalog intact. Observer errors are buffered and fail
capture without creating synthetic HTTP errors. A marked request that was never
completed fails capture. Avoid catching assertion errors to conceal test failures.

Each published catalog contains only the current run's scenarios. Previous
suite files are never inputs, so cleaning old artifacts is unnecessary. Filtered
runs replace the catalog with their selected scenarios; run the full capture
command when producing the full API catalog.

Output sorts scenario IDs and object keys, uses two-space indentation, and ends
with a newline. Writes use an exclusive temporary file and atomic rename.
Equivalent fixtures produce byte-identical catalogs. Stable IDs and controlled
synthetic data are the author's responsibility; there is no automatic redaction
or normalization.

## Supported exchanges and metadata

Version 1 supports GET, POST, PUT, PATCH, DELETE, HEAD, and OPTIONS; concrete
relative pathnames; JSON request/response objects, arrays, primitives, and null;
and empty responses. Use `.type('json').send(JSON.stringify(value))` for primitive
request bodies. Absent and explicit null bodies both record as null. Only the
response JSON content type is saved; authentication and other headers are omitted.

Marked query strings, followed redirects, actual HTTP retries, compressed
payloads, multipart, HTTP/2, and streaming/unbuffered exchanges are unsupported.
Keep them unmarked. Capture rejects unsupported content types and malformed JSON.
Unmarked requests retain native capabilities. The HTTP adapter patches Node
networking through Interceptors only for the capture configuration and disposes
it after each file. Integration with other HTTP mocking/interception libraries
is outside the initial supported configuration.

Metadata includes optional `title`, `category`, `group`, `tags`, `description`,
and `requestMatch`. Titles, categories, and groups must be nonblank; tags must be
unique nonblank strings. Vocabularies are open-ended. `bodyContains` is a recursive
object subset; arrays require full ordered equality. Hints must match the observed
request. Version 1 metadata remains compatible with legacy records accepted by
the current shared validator. Examples do not contain executable setup or DTO schemas.

## Entrypoints

| Import       | Responsibility                                                                                    |
| ------------ | ------------------------------------------------------------------------------------------------- |
| Package root | `CaptureSession`, metadata types, shared schema exports; no Node, runner, client, or file imports |
| `/node`      | `startHttpCapture()` returning a disposer; `withCaptureSession(session, run, signal?)`            |
| `/supertest` | `capture(id, metadata?)` native `.use()` plugin                                                   |
| `/vitest`    | `scenarioCapture({ outputDirectory })` and capture reporter                                       |
| `/files`     | `writeCatalog(filename, scenarios)` and `mergeScenarios(directory, diagnostic?)`                  |

The core session reserves definitions, validates and snapshots observations,
buffers errors, then returns scenarios from `finish()` or discards them.
Adapters own transport and runner lifecycles. Importing the root does not load
Vitest or Interceptors; importing the Supertest marker does not install interception.

`scenario-recorder-merge [directory]` is a local-only CLI for separately supplied
JSON recordings. It retains validation, duplicate diagnostics, shared-route
diagnostics, and deterministic merging; it ignores `catalog.json` and temporary
files. The dedicated capture workflow already produces its catalog and does not
need this merge command. Do not merge accumulated old Petstore suite files into
a newly captured catalog.

## Verification

```sh
npm test --workspace=@response-capture/scenario-recorder
npm run test:e2e
npm run scenarios:capture
```

Package tests cover observed HTTP data and exercise the built integration in
separate Vitest processes, including failures, retries, concurrency, skips,
publication errors, and preservation of existing catalogs. They require localhost
socket access. Builds emit JavaScript and declarations into `dist`.
