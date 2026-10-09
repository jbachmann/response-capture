# Historical implementation plan — NestJS API scenario recorder

This document records the original design proposal. For the current API,
examples, limitations, and verification commands, see the
[recorder usage guide](../test/support/api-scenario-recorder/README.md).
The proposal below is retained for design context.

## 1. Objective

Implement **test-only TypeScript tooling within the NestJS repository** that allows integration tests to explicitly record named HTTP request/response scenarios. Each recording must reflect an actual, successfully asserted HTTP interaction. The tooling writes JSON scenario files and can combine them into a deterministic catalog.

Keep the implementation small, readable, and consistent with the repository's existing testing conventions. Do not modify production request-handling code.

## 2. Definition of done

A developer can wrap an existing NestJS/Supertest integration test with a scenario-recording helper. After the test passes, the recorder captures the request method, path, JSON body, and observed response status and JSON body. A local command combines recordings into `catalog.json`. Failed tests do not contribute scenarios.

## 3. Scope

### Implement

- An explicit opt-in `recordScenario` test helper with a stable, developer-assigned scenario ID.
- Capture of the HTTP method, concrete request path, JSON request body, HTTP response status, and JSON response body.
- Optional scenario descriptions and request-matching hints.
- A versioned, technology-neutral JSON recording format.
- Runtime validation of scenario data before it is written.
- Deterministic file output with safe handling of concurrent test suites.
- A local merge command that combines scenario files into one catalog, rejecting duplicate IDs.
- Focused tests and developer documentation showing how to use the recorder.

### Do not implement

- Do not automatically record every HTTP request.
- Do not change the production NestJS middleware, controllers, interceptors, or response handling.
- Do not support non-JSON, multipart, streaming, SSE, or WebSocket interactions.

**Assumption:** Tests intended for recording use controlled, synthetic fixture values. This release records their data as supplied, without inspecting or sanitizing it.

## 4. JSON format (version 1)

### Single scenario

```json
{
  "schemaVersion": 1,
  "id": "pets.create.success",
  "description": "Creates a dog",
  "request": {
    "method": "POST",
    "path": "/pets",
    "body": { "name": "Fido", "species": "DOG" },
    "match": { "bodyContains": { "species": "DOG" } }
  },
  "response": {
    "status": 201,
    "headers": { "content-type": "application/json" },
    "body": { "id": "pet-example-1", "name": "Fido", "species": "DOG" }
  }
}
```

### Merged catalog

```json
{
  "catalogVersion": 1,
  "scenarios": []
}
```

### Format rules

1. Every scenario has a unique, stable ID. Reject duplicate IDs during catalog merging, even when their contents match.
2. HTTP methods are uppercase. `path` is the concrete relative pathname and does not include scheme, hostname, or query string.
3. Request and response bodies must be JSON values (object, array, primitive, or `null`). In v1, `null` represents both an absent body and an explicit JSON `null` body.
4. Response `status` is an integer HTTP status. Record the response's JSON content type when available; do not record unrelated headers.
5. `request.match` is optional. `bodyContains` means recursive object-subset matching, with exact equality for scalar values and full ordered equality for arrays.
6. The original request body is an observed example; it is not automatically an exact-match requirement.
7. Unknown schema/catalog versions and invalid shapes must fail with actionable errors.
8. This version records concrete paths, not route templates (for example `/pets/123`, not `/pets/:id`). Preserve this distinction in the documentation.

## 5. Suggested project structure

Adapt this layout to the repository's existing organization:

```text
test/support/api-scenario-recorder/
  types.ts
  schema.ts
  recorder.ts
  request-capture.ts
  validation.ts
  writer.ts
  merge.ts
  index.ts
  *.spec.ts
artifacts/api-scenarios/          # generated locally; gitignored
```

Avoid introducing a new workspace package unless the repository already has an established pattern for test-support packages.

## 6. Developer-facing API

Provide a small helper that names and records a single integration-test interaction.

**Important capture constraint:** Do not depend on undocumented Supertest internals (such as `_data`) to reconstruct the outgoing request. Choose and verify one of these approaches:

- **Preferred:** A recorder-managed wrapper around the Supertest request builder that captures the values supplied through supported methods such as `.send()`.
- **Fallback:** An explicit typed request descriptor passed beside the Supertest callback. If this approach is used, document that the developer must keep the descriptor aligned with the executed request and add checks where feasible.

Illustrative API using the fallback approach:

```ts
const recorder = createScenarioRecorder({
  suiteId: 'pets-controller',
  outputDirectory: 'artifacts/api-scenarios',
});

it('creates a pet', async () => {
  await recorder.recordScenario(
    'pets.create.success',
    {
      method: 'POST',
      path: '/pets',
      body: { name: 'Fido', species: 'DOG' },
    },
    () => request(app.getHttpServer())
      .post('/pets')
      .send({ name: 'Fido', species: 'DOG' })
      .expect(201),
    {
      description: 'Creates a dog',
      requestMatch: { bodyContains: { species: 'DOG' } },
    },
  );
});

afterAll(async () => {
  await recorder.flush();
});
```

This example describes the intended API, not an existing implementation. The coding agent may simplify the signature while preserving the required behavior.

`recordScenario` must await the request and its assertions. It should collect a scenario **only if the callback succeeds** and the resulting data validates. Exceptions and assertion failures must not leave partially recorded scenarios.

## 7. Implementation requirements

### HTTP capture

- Inspect the installed NestJS adapter, Supertest version, and Jest/Vitest setup before implementing the capture strategy.
- Record request values actually sent and response values actually observed; prefer supported interfaces over patching underlying Express response methods.
- Handle JSON objects, JSON arrays, JSON primitives, and empty responses.
- Support both successful and error responses, including representative `201`, `400`, and `404` cases.
- Reject unsupported payload/content types with a clear message identifying the affected scenario.
- Preserve status codes exactly as received.

### File output

- Collect recordings in memory during the suite, then write them when `flush()` is called.
- Give each suite/worker a distinct output file to avoid write collisions. Do not depend on test execution order.
- Write atomically using a temporary file and rename to prevent incomplete JSON files.
- Sort scenarios by ID and use consistent JSON indentation and a trailing newline.
- Given equivalent recordings, generate byte-identical output across runs. This requires stable test fixtures; no automatic replacement of IDs or timestamps is required in this release.
- Make duplicate `flush()` calls safe, or reject them with a clear error; document the chosen behavior.

### Catalog merging

- Provide a local command that loads scenario files from an output directory and writes `catalog.json`.
- Validate every file and every scenario before merging.
- Reject duplicate scenario IDs, invalid versions, and malformed files with actionable diagnostics.
- Sort the merged scenarios by ID for deterministic output.
- Do not inadvertently include a previous `catalog.json` in its own merge.
- Report scenarios sharing the same method/path as an informational diagnostic, not an automatic failure.

### Validation

- Validate required fields and their JSON-compatible types at runtime.
- Validate supported HTTP methods, relative path syntax, response status, and `bodyContains` matching rules.
- Provide errors that identify the scenario ID, filename when available, and invalid field.
- Keep the schema in one authoritative location within the repository.

## 8. Implementation phases

**Phase 1 — Inspect and design**

Review the existing NestJS integration-test harness and Supertest usage. Confirm the supported request-capture approach, where test helpers belong, and how local generated files are excluded from source control.

**Phase 2 — Record**

Implement the recorder API, request/response capture, runtime schema, and per-suite JSON output. Demonstrate passing success and error scenarios plus failure behavior.

**Phase 3 — Merge and validate**

Implement the local merge command, duplicate detection, deterministic ordering, schema validation, and concurrent-suite file handling.

**Phase 4 — Document and test**

Add runnable examples, recorder unit tests, end-to-end recorder tests against a small NestJS test route, and concise usage instructions including limitations and commands.

## 9. Acceptance criteria

- [ ] A passing integration test can opt into recording with a stable scenario ID.
- [ ] A non-opted-in test generates no scenario.
- [ ] Failed Supertest expectations produce no record.
- [ ] The recorded request method/path/body and response status/body reflect the executed exchange.
- [ ] Success and error scenarios, arrays, and empty JSON responses are handled appropriately.
- [ ] Unsupported payloads fail with clear diagnostics.
- [ ] Per-suite files are valid JSON and do not collide during parallel execution.
- [ ] The local merge command creates one valid, deterministically ordered `catalog.json`.
- [ ] Duplicate IDs and malformed scenario files cause useful errors.
- [ ] Re-running tests with equivalent fixture data produces identical output.
- [ ] The repository includes tests and a README explaining usage and limitations.
- [ ] No production code paths or external build/release infrastructure require modification.

## 10. Instructions for the coding agent

Inspect the repository before making changes. Reuse its existing TypeScript, package manager, test framework, formatting, and directory conventions. Implement only the local test-time recorder and its supporting validation/output tools. Prefer straightforward functions and types over generalized plugin architecture. Do not introduce unrelated features.

Demonstrate the tooling in at least one existing integration-test suite if feasible, otherwise in a minimal representative NestJS integration test. Run the relevant tests and document the commands and outcomes. Identify any limitations of the chosen Supertest capture mechanism.

## 11. Deferred enhancements

Potential follow-on work includes request/response field normalization, optional OpenAPI checks, reusable JSON schemas, route-template metadata, query-aware matching, and more advanced recording of multi-request test flows. These are not required for this release.

## Dynamic catalog browsing metadata

Version 1 scenario records now optionally include `title`, `category`, `group`,
`tags`, and the existing `description`. These labels are authored at recording
call sites and preserved during merging; no fixed category/group/tag vocabulary
is enforced. Titles, categories, and groups must be nonblank strings, and tags
must be unique nonblank strings. Updated validators accept both old and enriched
records; older strict validators require updating before reading enriched data.
See the [recorder guide](../test/support/api-scenario-recorder/README.md#browsing-metadata)
for the metadata argument and an example.
