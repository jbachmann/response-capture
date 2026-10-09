# API scenario recorder (test only)

Import `createScenarioRecorder` from `./support/api-scenario-recorder/index.js`
in integration tests. The recorder builds Supertest requests and captures their asserted JSON
responses. Production code has no recorder imports.

```ts
const recorder = createScenarioRecorder({
  app: app.getHttpServer(),
  suiteId: 'pets-controller',
  outputDirectory: 'artifacts/api-scenarios',
});

it('creates a pet', async () => {
  await recorder.recordScenario(
    'pet.create.success',
    { method: 'POST', path: '/pet', body: { name: 'Milo', photoUrls: [] } },
    async (test) => {
      const response = await test.expect(201);
      expect(response.body).toEqual({
        id: 1, name: 'Milo', photoUrls: [], tags: [], status: 'available',
      });
      return response;
    },
    {
      description: 'Creates a pet',
      requestMatch: { bodyContains: { name: 'Milo' } },
    },
  );
});

afterAll(async () => {
  await recorder.flush();
});
```

Create the recorder after the application is initialized. A recorder targets
one server instance. The Petstore suites create a recorder within each opted-in
test because their application is recreated before every test. Persistence tests
create their recorder after reopening the server when recording persisted reads.
Each test flushes only after all its assertions have succeeded, so a later test
assertion failure leaves that test's collected scenarios unwritten.

The descriptor **builds the executed request**. Its body is snapshotted,
validated, JSON-serialized and sent using supported Supertest `.type('json')`
and `.send()` methods, including strings, numbers, booleans, arrays and null.
Omitting `body` sends no payload; recordings use null for both absent and
explicit JSON null bodies. The callback receives only an awaitable expectation
builder, with supported `.expect()` forms for status, body, headers and custom
checks. It must return the awaited response. Put **all assertions for the
scenario inside this callback**; it records only after the callback succeeds.
Failures elsewhere in a test after this call cannot be detected by this helper.
Do not catch assertion failures in the callback and turn them into successes.
Requests outside `recordScenario` are never collected.

This deliberately small interface does not expose `.send()`, `.set()`, custom
parsers, query methods, multipart, streaming or callback-style expectations.
It uses no undocumented Supertest fields and disables redirects so the
recorded path and response refer to one exchange. Bodies are parsed from the
observed JSON response text, so primitive values are retained accurately.
Empty responses become null; nonempty responses require `application/json`
or an `application/*+json` content type. Only the observed JSON content type
is saved; unrelated headers are omitted.

Supported methods are GET, POST, PUT, PATCH, DELETE, HEAD and OPTIONS. Paths
must be concrete relative pathnames such as `/pet/123`, with no origin, query,
fragment or `/pet/:id` template. Percent-encode non-ASCII characters and other
characters outside URI pathname syntax. Version 1 does not model queries. The
`schema.ts` file is the authoritative runtime schema and type definition.
Each scenario uses `schemaVersion: 1`; suite files and the merged catalog use
`{ "catalogVersion": 1, "scenarios": [...] }`. The merger also accepts files
containing a single scenario. Unknown fields, versions, unsupported data,
invalid status codes and mismatched hints fail with field/ID diagnostics.

`requestMatch.bodyContains` is an optional recursive object subset that must
match the captured fixture. Scalars require exact equality; arrays require
full ordered equality, including all fields of objects inside them. The
example body alone does not impose an exact-match requirement.

Use controlled synthetic fixtures. Values are recorded as supplied, without
sanitization or normalization. Stable IDs and deterministic fixture data are
the developer's responsibility.

## Output and local workflow

```sh
# Start a fresh recording session; old runs otherwise remain merge inputs.
rm -rf artifacts/api-scenarios
npm run test:e2e
npm run scenarios:merge
# Optional directory override:
npm run scenarios:merge -- /path/to/recordings
```

The merge command compiles just its test-support TypeScript into gitignored
`.tmp/api-scenario-recorder` using the existing compiler. No extra runtime or
package is needed. Generated recordings are gitignored too.

Each recorder instance has a filename containing a suite ID hash and a unique
instance token. Parallel suites/workers, including ones with the same suite ID,
cannot overwrite each other. Filename tokens vary across runs; **file contents**
are byte-identical for equivalent fixtures: IDs and object keys are sorted,
indentation is two spaces, and every file ends with a newline. Temporary files
are created exclusively and renamed atomically; the merger ignores them and
any previous `catalog.json`. Run the merger after all suites finish.

Call `flush()` only after awaiting every recording. It seals the recorder and
is idempotent: subsequent calls share the same result (including a write
failure). Further recording calls fail. An empty recorder writes no file.
Duplicate IDs in one recorder are rejected; failed captures leave no partial
scenario and may be retried. Merging validates every JSON input and rejects
all duplicate IDs, even identical scenarios, reporting both filenames. It
preserves the previous catalog on validation failure. Shared method/path
combinations are informational diagnostics. An empty directory produces an
empty catalog.

## Verification

```sh
npm test
npm run test:e2e
npx tsc --noEmit --incremental false
npm run build
npm run lint
```

Focused unit tests cover schema validation, recursive matching, merge errors,
ordering and repeatability. NestJS integration tests cover JSON values,
204/404 responses, rejected expectations and later callback assertions,
unsupported content types, fixture snapshots, duplicate and concurrent
recording, flush lifecycle and byte-identical output. The Petstore feature
suites record 55 scenarios across 14 test cases: pet CRUD, order defaults and
CRUD, inventory, relationship conflicts, persistence, repeatable training seed
and reset operations, and malformed or maximum safe IDs. It includes
201/400/404/409 interactions, list arrays and 204 deletion. Query-dependent
filter tests and non-JSON root/Swagger UI responses remain outside recording
because version 1 does not model these interactions.

Integration tests open localhost sockets; restricted execution environments
must allow this for end-to-end verification.

## Browsing metadata

The optional fourth argument to `recordScenario` accepts `title`, `category`,
`group`, `tags`, and `description`, alongside `requestMatch`:

```ts
await recorder.recordScenario(
  'example.dispatch',
  { method: 'POST', path: '/dispatch', body: { destination: 'station' } },
  test => test.expect(201),
  {
    title: 'Dispatch to a station',
    category: 'Delivery',
    group: 'Dispatch',
    tags: ['express'],
    description: 'After a station exists, dispatch creates a delivery to it.',
  },
);
```

Author these labels at the recording call site. Explain each variation, relevant
setup, and observed result; recorded examples do not include executable setup.
Titles, categories, and groups must be nonblank strings. Tags must be unique,
nonblank strings. Category/group/tag vocabularies are open-ended: consumer UI
choices come from the catalog, without domain-specific configuration. Metadata is
snapshotted during recording and preserved during deterministic merging.

These fields are an additive extension of schema/catalog version 1. Updated
tooling accepts legacy records without metadata. Older strict validators reject
the added fields and must be updated before reading enriched recordings.
The consumer's fallbacks display IDs and an Uncategorized section; they do not
infer categories or task names from paths or ID conventions.
