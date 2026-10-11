# Scenario recorder

Record concrete JSON request/response examples from passing tests. Mark selected
Supertest requests, run a dedicated Vitest capture configuration, and get a local
catalog. Production application code needs no recorder imports or changes.

- [Usage and customization](docs/usage.md): selective capture, metadata, matching hints,
  fixtures, custom runners, merging, and troubleshooting.
- [API reference](docs/api.md): all entrypoints, types, validation, supported exchanges,
  and publication guarantees.

## Requirements

This is a private workspace package, `@response-capture/scenario-recorder`.
Use Node 24 (`>=24 <25`). The supplied adapters support Vitest `^4.1.11` and
Supertest `^7.3.1`; both are optional peers for consumers using other entrypoints.
HTTP observation uses the pinned, verified Interceptors version `0.39.8`.

The standard workflow needs a real HTTP server, JSON endpoints, and an existing
Vitest/Supertest test suite. Local tests need permission to open localhost sockets.

## Get started

### 1. Build the workspace packages

From the repository root, after installing dependencies:

```sh
npm run build --workspace=@response-capture/contracts
npm run build --workspace=@response-capture/scenario-recorder
```

### 2. Mark a request in an existing test

This example uses this repository's Petstore fixture. Place it in
`apps/petstore-api/test/recorder-example.e2e-spec.ts` so the E2E configuration selects
it and the relative fixture import resolves.
The fixture creates and closes an isolated application for each test.

```ts
import { expect, it } from 'vitest';
import { capture } from '@response-capture/scenario-recorder/supertest';
import { usePetstoreFixture } from './support/petstore-fixture.js';

const fixture = usePetstoreFixture();

it('creates a pet', async () => {
  const response = await fixture
    .api()
    .post('/pet')
    .send({ name: 'Milo', photoUrls: [] })
    .use(
      capture('pet.create.quickstart', {
        title: 'Create a pet with defaults',
        category: 'Pets',
        group: 'Create a pet',
        tags: ['defaults'],
        description: 'Creates Milo with the default available status.',
        requestMatch: { bodyContains: { name: 'Milo' } },
      }),
    )
    .expect(201);

  expect(response.body.status).toBe('available');
});
```

Keep native request chains and ordinary assertions. Await every marked request.
Unmarked requests are excluded. Markers are entirely inert outside a capture
session, including metadata validation.

### 3. Add a dedicated capture configuration

For another application, extend its existing E2E configuration:

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

`scenarioCapture` supplies the setup file and default/capture reporters. Keep the
ordinary E2E configuration for normal runs. Relative output paths resolve from
the command's working directory. Use a separate output directory for each
independent capture command; parallel workers within one command are supported.

### 4. Run and inspect the catalog

From the application's directory, with Vitest available:

```sh
npx vitest run --config vitest.config.capture.ts
```

A successful run writes both:

```text
artifacts/api-scenarios/<uuid>/catalog.json  # retained copy of this run
artifacts/api-scenarios/catalog.json         # latest successful run
```

For the test above, a catalog looks like this (the actual ID comes from the server):

```json
{
  "catalogVersion": 1,
  "scenarios": [
    {
      "category": "Pets",
      "description": "Creates Milo with the default available status.",
      "group": "Create a pet",
      "id": "pet.create.quickstart",
      "request": {
        "body": { "name": "Milo", "photoUrls": [] },
        "match": { "bodyContains": { "name": "Milo" } },
        "method": "POST",
        "path": "/pet"
      },
      "response": {
        "body": { "id": 1, "name": "Milo", "photoUrls": [], "status": "available", "tags": [] },
        "headers": { "content-type": "application/json; charset=utf-8" },
        "status": 201
      },
      "schemaVersion": 1,
      "tags": ["defaults"],
      "title": "Create a pet with defaults"
    }
  ]
}
```

Only the current run contributes scenarios. A filtered run replaces the latest
catalog with its selected scenarios. Failed or invalid runs preserve the previous
catalog. Output sorts scenario IDs and object keys; fixture data must also be
stable to produce repeatable files.

## This repository's Petstore workflow

The capture configuration already exists. From the repository root:

```sh
npm run test:e2e         # ordinary API tests
npm run scenarios:capture
```

Petstore output is under `apps/petstore-api/artifacts/api-scenarios`.
Capture needs no catalog API. After starting catalog-api, explicitly upload with
`npm run scenarios:submit`. Uploading, Git metadata, and Petstore identity belong
to the [application submission script](../../apps/petstore-api/test/support/catalog-submission.ts),
not the recorder.

See the [Petstore tests](../../apps/petstore-api/test/pet.e2e-spec.ts),
[store tests](../../apps/petstore-api/test/store.e2e-spec.ts), and
[capture configuration](../../apps/petstore-api/vitest.config.capture.ts) for working examples.

## Verify the package

```sh
npm test --workspace=@response-capture/scenario-recorder
```

The package suite checks HTTP observation and built entrypoints, including retries,
concurrency, failed assertions, teardown failures, and preservation of old catalogs.
Builds emit JavaScript and declarations into `dist`.
