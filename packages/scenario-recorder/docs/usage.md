# Usage and customization

[Getting started](../README.md) · [API reference](api.md)

## What you control

| Control                                   | Where to set it                                             |
| ----------------------------------------- | ----------------------------------------------------------- |
| Included exchanges                        | Apply `.use(capture(...))` to selected requests             |
| IDs, labels, and matching hints           | Arguments to `capture`                                      |
| Concrete request and response values      | Test fixtures, server behavior, and native Supertest chains |
| Selected tests, test retries, concurrency | Ordinary Vitest configuration and CLI                       |
| Output location                           | `scenarioCapture({ outputDirectory })`                      |
| Custom runner or adapter lifecycle        | Core sessions, `/node`, and `/files` APIs                   |
| Merge messages                            | `mergeScenarios(directory, diagnostic)`                     |

The recorder has no built-in switches for redaction, normalization, extra headers,
or additional transports. [Supported exchanges](api.md#supported-http-exchanges)
are fixed constraints of the supplied HTTP adapter.

## Select exchanges and verify outcomes

The generic HTTP examples below require your real test server as `app` (a Node
HTTP server accepted by Supertest), initialized and cleaned up by your test fixture.
Assume a fresh database, `/pet` creation returning 201, `/pet/:id` reading or deleting
records, and JSON error responses. Use your application's routes and expectations.
Imports are shown in the first example and reused in subsequent snippets.

```ts
import request from 'supertest';
import { expect, it } from 'vitest';
import { capture } from '@response-capture/scenario-recorder/supertest';

it('reads and deletes a pet', async () => {
  // Setup is needed by the test but excluded from the catalog.
  const created = await request(app).post('/pet').send({ name: 'Milo', photoUrls: [] }).expect(201);
  const path = `/pet/${created.body.id}`;

  const read = await request(app)
    .get(path)
    .use(capture('pet.read.success', { title: 'Read an existing pet' }))
    .expect(200);
  expect(read.body.name).toBe('Milo');

  await request(app).delete(path).use(capture('pet.delete.success')).expect(204);

  await request(app).get(path).use(capture('pet.read.after-deletion')).expect(404);
});
```

This records three scenarios, including the empty 204 response as `body: null`.
An HTTP 404 is eligible when the test expects it and passes. A failed assertion
prevents publication of the entire run. `it.fails` tests are excluded even when
Vitest considers the expected failure successful. Do not catch assertion failures
to hide them; rejected Supertest expectations also mark the session as failed.

Each marker needs a unique ID across the final published run. Several scenarios
may share a method/path, but one ID cannot represent several exchanges. Attach
the marker before executing the request and before unsupported request operations
so its guards can observe them.

## Reuse metadata and create parameterized scenarios

Titles, categories, groups, and tags are author-defined vocabularies. Use them to
organize examples; the recorder does not derive them from routes or test names.

```ts
import type { CaptureMetadata } from '@response-capture/scenario-recorder';

const petMetadata = (title: string, overrides: CaptureMetadata = {}): CaptureMetadata => ({
  category: 'Pets',
  group: 'Create a pet',
  tags: ['creation'],
  title,
  ...overrides,
});

it.each([
  { key: 'available', status: 'available' },
  { key: 'pending', status: 'pending' },
])('creates a $key pet', async ({ key, status }) => {
  const body = { name: 'Milo', photoUrls: [], status };
  await request(app)
    .post('/pet')
    .send(body)
    .use(
      capture(
        `pet.create.${key}`,
        petMetadata(`Create a ${key} pet`, {
          tags: ['creation', key],
          requestMatch: { bodyContains: { status } },
        }),
      ),
    )
    .expect(201);
});
```

Here overrides replace fields such as `tags`; they do not append automatically.
Choose stable case keys rather than random IDs or timestamps. The same ID may
appear in repeated test attempts because only the final passing attempt contributes.
Avoid ID collisions between separate tests or parameter rows.

## Describe matching requests

`requestMatch` becomes `request.match` in the catalog. It describes a distinguishing
subset of the request body and must match the observed exchange. It does not change
what the server receives or intercept/mock requests.

```ts
const body = {
  name: 'Milo',
  category: { id: 1, name: 'Cats' },
  tags: [{ id: 2, name: 'friendly' }],
  photoUrls: [],
};

await request(app)
  .post('/pet')
  .send(body)
  .use(
    capture('pet.create.categorized', {
      requestMatch: {
        bodyContains: {
          category: { name: 'Cats' },
          tags: [{ id: 2, name: 'friendly' }],
        },
      },
    }),
  )
  .expect(201);
```

Objects match recursively as subsets: omitting `category.id` above is valid.
Arrays require full ordered equality, including every field of objects inside
an array. With the same body, these hints fail capture:

```ts
const wrongName = { bodyContains: { name: 'Luna' } };
const incompleteArray = { bodyContains: { tags: [{ name: 'friendly' }] } };
const wrongArrayLength = { bodyContains: { tags: [] } };
// Passing any of these as requestMatch fails when the exchange is observed.
```

The top-level `bodyContains` must be an object; it cannot directly describe an array
or primitive request body. Use metadata and distinct IDs to label those cases.

## Capture JSON values as sent

For an endpoint `/echo` that returns the submitted JSON with status 201:

```ts
import type { Json } from '@response-capture/scenario-recorder';

const cases: { key: string; body: Json }[] = [
  { key: 'object', body: { name: 'Milo' } },
  { key: 'array', body: [1, { enabled: true }] },
  { key: 'string', body: 'hello' },
  { key: 'number', body: 42 },
  { key: 'boolean', body: false },
  { key: 'null', body: null },
];

for (const { key, body } of cases) {
  await request(app)
    .post('/echo')
    .type('json')
    .send(JSON.stringify(body))
    .use(capture(`echo.${key}`))
    .expect(201);
}
```

Run the loop inside an async test. Explicit JSON serialization works for all these
values and is required for primitive bodies. Object/array requests can also use
native `.send(body)`. Absent bodies and explicit JSON null both record as `null`.

Custom `.serialize()` and multiple `.send()` calls are observed as actually sent,
not inferred from the original JavaScript arguments. Only the response JSON
content type is saved; request headers and other response headers are omitted.
You can still use `.set()` for authentication in the native request chain.

## Keep captured data stable

Use synthetic names, isolated databases, repeatable seed data, and controllable
server clocks/IDs where your application supports them. Those are test-fixture
choices, not recorder settings. The [Petstore fixture](../../../apps/petstore-api/test/support/petstore-fixture.ts)
creates a fresh database per test; the [training tests](../../../apps/petstore-api/test/training.e2e-spec.ts)
show repeatable seed data.

Metadata is copied when the marker reserves its definition. HTTP bodies are read
from cloned serialized messages, and completed observations are copied into the
session. Mutating `response.body` after awaiting a request does not rewrite the
recording. Prepare synthetic or sanitized data before sending it or have the test
server produce it; there is no automatic redaction or normalization. Sensitive
values in JSON bodies will appear in the catalog.

## Configure a capture run

Use the [dedicated configuration](../README.md#3-add-a-dedicated-capture-configuration)
and choose a directory through an environment variable if needed:

```ts
// Replace the test property in the capture config's defineConfig call.
const test = scenarioCapture({
  outputDirectory: process.env.SCENARIO_OUTPUT ?? 'artifacts/api-scenarios',
});
```

`outputDirectory` is the helper's only recorder option. Keep test selection,
timeouts, test retries, and worker settings in the existing Vitest configuration.
For example, from the application directory:

```sh
npx vitest run --config vitest.config.capture.ts -t 'creates a pet'
```

This publishes only scenarios from selected passing tests and replaces the latest
catalog. An entirely successful run with no scenarios publishes an empty catalog.
Run the full suite to produce the complete catalog. Independent commands must use
separate output directories; the recorder does not coordinate competing publishers.
Vitest test retries are supported; actual HTTP retries on a marked request are not.

## Use a custom runner with Supertest

Own the lifecycle when you are not using the Vitest integration:

1. Install HTTP observation once for the worker.
2. Run and await marked requests inside a fresh session.
3. Finish only after assertions and required teardown pass, then write the catalog.
4. Discard on failure and always dispose observation.

This standalone TypeScript example uses a real echo server and Node assertions.
It can be compiled and run with the workspace package dependencies available.

```ts
import { createServer } from 'node:http';
import { deepStrictEqual } from 'node:assert/strict';
import request from 'supertest';
import { CaptureSession } from '@response-capture/scenario-recorder';
import { startHttpCapture, withCaptureSession } from '@response-capture/scenario-recorder/node';
import { capture } from '@response-capture/scenario-recorder/supertest';
import { writeCatalog } from '@response-capture/scenario-recorder/files';

const server = createServer(async (req, res) => {
  let text = '';
  for await (const chunk of req) text += chunk;
  res.writeHead(201, { 'content-type': 'application/json' });
  res.end(text);
});
const closeServer = async (): Promise<void> => {
  if (server.listening) {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
};
const session = new CaptureSession();
const stop = startHttpCapture();

try {
  await withCaptureSession(session, async () => {
    const response = await request(server)
      .post('/echo')
      .send({ name: 'Milo' })
      .use(capture('echo.milo', { title: 'Echo a name' }))
      .expect(201);
    deepStrictEqual(response.body, { name: 'Milo' });
  });
  await closeServer();
  await writeCatalog('artifacts/custom/catalog.json', session.finish());
} catch (error) {
  session.discard();
  throw error;
} finally {
  stop();
  await closeServer();
}
```

`withCaptureSession` drains pending observations but does not finish or publish.
You decide which runner outcomes permit publication and where to write. The custom
writer does not create the Vitest reporter's UUID archive automatically. For several
attempts, create a session per attempt and retain only the eligible result.

Starting HTTP observation alone does not capture arbitrary HTTP clients. The
supplied Supertest marker associates the native request with its session. Plain
`fetch` calls and unmarked requests are not recorded by this adapter.

## Supply observations from another adapter

The core has no Node, client, or runner imports. A custom adapter can supply valid
JSON observations without installing HTTP interception:

```ts
import { CaptureSession } from '@response-capture/scenario-recorder';
import { writeCatalog } from '@response-capture/scenario-recorder/files';

const session = new CaptureSession();
try {
  const definition = session.reserve('pet.read.custom', { title: 'Read a pet' });
  // Replace these values with the serialized exchange observed by your adapter.
  session.observe(
    definition,
    { method: 'GET', path: '/pet/1', body: null },
    { status: 200, body: { id: 1, name: 'Milo' } },
  );
  await writeCatalog('artifacts/custom/catalog.json', session.finish());
} catch (error) {
  session.discard();
  throw error;
}
```

Use the exact definition returned by `reserve`. Your adapter must associate each
exchange, await completion, and report asynchronous errors with `session.fail(id,
error)`. The core validates the shared schema; transport observation and runner
success policy remain your responsibility.

## Merge separately supplied recordings

The dedicated Vitest workflow already produces its catalog and needs no merge step.
For independent, intentionally selected files, put single scenarios or complete
version-1 catalogs into one directory as `.json` files, then run:

```sh
npx scenario-recorder-merge artifacts/manual-recordings
# With no argument, the directory defaults to artifacts/api-scenarios.
```

Or customize diagnostics programmatically:

```ts
import { mergeScenarios } from '@response-capture/scenario-recorder/files';

const filename = await mergeScenarios('artifacts/manual-recordings', (message) => {
  console.warn(`[recordings] ${message}`);
});
console.info(`Merged catalog: ${filename}`);
```

The directory must exist. Merging reads only immediate lowercase `.json` filenames,
ignores `catalog.json` and writer-generated `.tmp` files, and writes `catalog.json`.
Shared method/path values produce informational messages; duplicate IDs fail even
when contents are identical. Invalid input leaves the previous catalog intact.
An empty directory produces an empty catalog. Do not feed accumulated old suite
recordings into a fresh capture run.

## Troubleshooting

| Symptom                                                 | Action                                                                                    |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| No catalog after an ordinary test run                   | Use the dedicated capture configuration; markers alone do not enable capture.             |
| No complete exchange observed                           | Await the marked request and execute it inside the capture session.                       |
| Duplicate scenario ID                                   | Give each selected exchange a unique stable ID, including parameterized cases.            |
| Hint does not match                                     | Compare `bodyContains` with the serialized request; arrays need full equality.            |
| Unsupported content type or malformed JSON              | Use a JSON endpoint and valid serialization, or leave this request unmarked.              |
| Query, redirect, retry, streaming, or compression error | Leave that exchange unmarked; these transports are unsupported.                           |
| Old catalog remains                                     | Check assertions, teardown, unhandled errors, capture validation, and publication errors. |
| Catalog contains only part of the suite                 | Rerun the full capture command; filtered runs replace the latest catalog.                 |
| Output appeared in another directory                    | Resolve the configured path from the command's working directory.                         |
| Permission or rename error during publication           | Use a writable output directory and avoid independent commands sharing it.                |
