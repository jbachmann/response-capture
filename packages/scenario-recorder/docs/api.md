# API reference

[Getting started](../README.md) · [Usage and customization](usage.md)

## Entrypoints

| Import from `@response-capture/scenario-recorder` | Exports / responsibility                                                                         |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Package root                                      | `CaptureSession`, `CaptureMetadata`, `CaptureDefinition`, and all shared scenario schema exports |
| `/supertest`                                      | `capture(id, metadata?)`, a native Supertest `.use()` plugin                                     |
| `/node`                                           | `startHttpCapture()` and `withCaptureSession(session, run, signal?)`                             |
| `/vitest`                                         | `scenarioCapture(options)`, `ScenarioCaptureReporter`, and `ScenarioCaptureOptions`              |
| `/vitest/setup`                                   | Side-effect setup module installing observation and Vitest hooks; no exported API                |
| `/files`                                          | `writeCatalog(filename, scenarios)` and `mergeScenarios(directory, diagnostic?)`                 |

Importing the root loads no Node APIs, Vitest, HTTP client, or file writer.
Importing `/supertest` does not install interception. `/vitest` augments Vitest's
`TaskMeta` with optional `scenarioRecorder?: Scenario[]` for worker/coordinator
communication. Let the supplied integration manage that field.

## Shared data types

```ts
export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';

export interface ScenarioMetadata {
  title?: string;
  category?: string;
  group?: string;
  tags?: string[];
  description?: string;
}

export interface RequestExample {
  method: Method;
  path: string;
  body: Json;
  match?: { bodyContains: { [key: string]: Json } };
}

export interface Scenario extends ScenarioMetadata {
  schemaVersion: 1;
  id: string;
  request: RequestExample;
  response: {
    status: number;
    headers?: { 'content-type': string };
    body: Json;
  };
}

export interface Catalog {
  catalogVersion: 1;
  scenarios: Scenario[];
}

export type CaptureMetadata = ScenarioMetadata & { requestMatch?: RequestExample['match'] };
export interface CaptureDefinition {
  id: string;
  metadata: CaptureMetadata;
}
```

`capture`/`reserve` accept `requestMatch`; finished scenarios contain `request.match`.
Records without optional metadata remain valid. Examples contain concrete data,
not executable setup or DTO schemas.

### Validation rules

| Field                        | Rule                                                                                                     |
| ---------------------------- | -------------------------------------------------------------------------------------------------------- |
| `id`                         | Nonblank string; authors choose stable values; unique within a catalog                                   |
| `title`, `category`, `group` | Optional nonblank strings; open-ended vocabularies                                                       |
| `tags`                       | Optional array of unique nonblank strings                                                                |
| `description`                | Optional string; an empty string is accepted                                                             |
| Request `method`             | One of the seven methods above                                                                           |
| Request `path`               | Concrete relative pathname beginning with `/`; no absolute URL, query, fragment, or `:parameter` segment |
| Request/response `body`      | Required JSON value, including `null`                                                                    |
| `request.match.bodyContains` | JSON object matching a recursive subset of the body; arrays use exact ordered equality                   |
| Response `status`            | Integer from 100 through 599                                                                             |
| Response `headers`           | Optional object containing only a JSON `content-type`                                                    |
| Version fields               | `schemaVersion: 1` and `catalogVersion: 1`                                                               |

Unknown fields are rejected. JSON validation accepts finite numbers, arrays, and
plain objects (including null-prototype objects). Undefined values, cycles,
symbol keys, sparse arrays, extra array properties, and non-JSON objects are invalid.
Nonblank strings are validated without automatic trimming or normalization.

### Shared exports from the root

| Export              | Signature and behavior                                                                                                                                                   |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `methods`           | Readonly tuple of the supported methods, in the order shown in `Method`                                                                                                  |
| `validateJson`      | `(value: unknown, context: string, field: string, ancestors?: Set<unknown>): asserts value is Json`; recursive validation; optional ancestor set defaults to a fresh set |
| `validateRequest`   | `(value: unknown, context: string): asserts value is RequestExample`                                                                                                     |
| `validateScenario`  | `(value: unknown, source?: string): asserts value is Scenario`; source defaults to `'scenario'`                                                                          |
| `validateCatalog`   | `(value: unknown, source: string): asserts value is Catalog`; also rejects duplicate IDs                                                                                 |
| `parseCatalog`      | `(value: unknown): Catalog`; validates with source `'catalog'` and returns the same value; does not parse a JSON string                                                  |
| `bodyContains`      | `(actual: Json, expected: Json): boolean`; recursive object subsets, exact arrays/scalars                                                                                |
| `isJsonContentType` | `(value: string): boolean`; accepts `application/json` and `application/*+json`, case-insensitively, with optional parameters                                            |

Validators return no value on success and throw descriptive `Error`s on failure.
Supply a source/context such as a filename to identify bad input. Use
`parseCatalog(JSON.parse(text))` when reading serialized catalogs.

## Supertest marker

```text
capture(id: string, metadata?: CaptureMetadata): (test: Test) => void
```

`metadata` defaults to `{}`. Pass the returned plugin to `.use()` before executing
the request. Within a capture scope it reserves a definition, associates the native
request with that scope, and monitors Supertest completion errors and unsupported
operations. It preserves native request identity, chains, and assertions.

Outside a scope the plugin does nothing, even for invalid metadata. Within a scope,
reservation errors are buffered into the session and also thrown. HTTP observation
errors are buffered and reported at `finish()`; they do not create synthetic HTTP
responses. A rejected Supertest expectation fails capture even if user code catches it.

One marked request supports one completed exchange. Actual HTTP retries and followed
redirects fail capture. Unmarked requests retain native Supertest capabilities.

## Core session lifecycle

```text
new CaptureSession()
reserve(id: string, metadata?: CaptureMetadata): CaptureDefinition
observe(definition: CaptureDefinition, request: RequestExample, response: Scenario['response']): void
fail(id: string, error: unknown): void
finish(): Scenario[]
discard(): void
```

1. **Reserve** a unique ID and valid metadata (`{}` by default). Metadata is copied.
2. **Observe** one exchange using the exact returned definition object. The scenario
   is validated, including its matching hint, and copied into private session state.
3. **Finish** after the runner accepts the attempt. It closes the session and returns
   scenarios in observation insertion order. File writers perform ID sorting.

`reserve` throws for closed sessions, duplicate IDs, or invalid metadata.
`observe` throws for an unknown definition, a second exchange for the ID, or an
invalid scenario. Treat returned definitions as opaque handles; do not mutate them.

`fail` buffers a message prefixed with the scenario ID. Custom adapters should call
it for asynchronous observation errors. Direct `reserve`/`observe` validation errors
are thrown; a custom integration must propagate or explicitly buffer those errors.

`finish` rejects any buffered errors or reserved ID without a completed exchange,
joining messages with newlines. It closes the session even when it throws; calling
it again fails. `discard` closes the session and clears captured scenarios, with no
publication. Calling `discard` repeatedly is safe. On closed sessions, `observe`
and `fail` do nothing, while `reserve` and `finish` throw.

## Node HTTP observation

```text
startHttpCapture(): () => void
withCaptureSession<T>(session: CaptureSession, run: () => Promise<T>, signal?: AbortSignal): Promise<T>
```

`startHttpCapture` installs Interceptors' Node `ClientRequest` observation. Its
returned function disposes interception and clears exchange tracking. Install once
per worker and dispose after outstanding sessions finish. It uses public
request/response events, request IDs, and `getRawRequest()`; it adds no headers and
never mocks responses.

`withCaptureSession` creates an `AsyncLocalStorage` scope, awaits `run`, and drains
pending body observations in a `finally` block. It returns the callback's result
or propagates its error; it does not finish/discard the session or write files.
An optional abort signal cancels observation body reads. The callback/runner must
handle its own cancellation; the signal does not make arbitrary callback work stop.

Bodies are cloned before reading. Serialized JSON, including custom serializers
and repeated `.send()` calls, is observed as actually sent. The adapter observes
only native requests associated by the Supertest marker. Reopening a server during
a session does not require recorder reinitialization.

### Supported HTTP exchanges

These restrictions apply to marked exchanges through the supplied adapters;
the core still requires the shared JSON schema for custom observations.

| Exchange                                                        | Support                                                                   |
| --------------------------------------------------------------- | ------------------------------------------------------------------------- |
| GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS                    | Supported with concrete relative pathnames                                |
| JSON objects, arrays, primitives, null                          | Supported with a JSON content type for nonempty bodies                    |
| Empty request/response bodies                                   | Recorded as `null`; an explicitly non-JSON content type is still rejected |
| JSON content types with parameters or `+json` suffix            | Supported; only response `content-type` is retained                       |
| Authentication and other headers                                | Usable in native requests; omitted from the catalog                       |
| Query strings, fragments, route placeholders                    | Unsupported                                                               |
| Followed redirects or actual HTTP retries                       | Unsupported; a marked request must produce one exchange                   |
| Compressed request/response payloads                            | Unsupported except absent/`identity` content encoding                     |
| Multipart, `.attach()`, `.field()`, HTTP/2                      | Unsupported                                                               |
| Streaming requests, `.write()`, `.pipe()`, unbuffered responses | Unsupported                                                               |
| Malformed JSON, nonempty bodies without JSON content type       | Rejected                                                                  |
| Mocked responses                                                | Rejected; capture requires a real server                                  |

Integration with other HTTP mocking/interception libraries is outside the supported
configuration. Leave unsupported exchanges unmarked.

## Vitest integration

```text
interface ScenarioCaptureOptions { outputDirectory: string }
scenarioCapture(options: ScenarioCaptureOptions): TestUserConfig
new ScenarioCaptureReporter(options: ScenarioCaptureOptions)
```

`scenarioCapture` requires a nonblank `outputDirectory` (no default). It resolves
relative paths against the command's working directory and returns test options:

- `setupFiles`: the package's `/vitest/setup` module.
- `reporters`: Vitest's `'default'` and a `ScenarioCaptureReporter` instance.

Merge these into a dedicated configuration. Ordinary Vitest settings control test
selection, retries, concurrency, timeouts, and other reporters. Check the final
configuration when combining existing setup files or reporters; the helper provides
its own entries rather than editing another configuration itself.

The setup module installs observation, disposes it in `afterAll`, and uses
`aroundEach` for a fresh session per attempt. Captured scenarios travel through
serializable test metadata. Concurrent tests and parallel workers have independent
sessions, though the application fixture must itself support that concurrency.

Only the final passing attempt is eligible. Skipped, aborted, failed, and
expected-failure (`it.fails`) tests are excluded. A session is finished only for
an eligible attempt; otherwise it is discarded.

### Reporter and publication

`ScenarioCaptureReporter` implements Vitest's
`onTestRunEnd(modules, errors, reason): Promise<void>`. Use the helper for normal
setup. Advanced integrations may instantiate the reporter, but must also supply
the capture setup/metadata lifecycle; the reporter alone observes no HTTP traffic.
When constructing it directly, its `outputDirectory` is used as supplied; helper
validation and path resolution are not applied by the constructor.

The reporter publishes only when `reason === 'passed'` and there are no run errors.
It collects scenarios from passing, non-expected-failure tests and rejects duplicate
IDs across tests/workers with both source names in the diagnostic. No previous
catalog or suite file is read as input.

Each successful run writes `<outputDirectory>/<uuid>/catalog.json`, then
`<outputDirectory>/catalog.json`. The latter contains only the current run, including
an empty list when no scenarios were captured. Run failures, interruptions, teardown
failures, unhandled errors, invalid data, and duplicate IDs leave the previous catalog
intact. A publication error rejects the reporter operation, fails the command, and
removes the new UUID directory. The two writes are individually atomic, not a single
filesystem transaction; a process crash between them can leave only the archived copy.

## File APIs and CLI

```text
writeCatalog(filename: string, scenarios: Scenario[]): Promise<void>
mergeScenarios(directory: string, diagnostic?: (message: string) => void): Promise<string>
```

`writeCatalog` wraps scenarios in `{ catalogVersion: 1, scenarios }`, validates the
catalog, and writes the requested filename. It creates parent directories. Duplicate
IDs or invalid data reject without replacing previous output. It has no runner
success policy or UUID archive behavior.

`mergeScenarios` reads immediate `.json` files from an existing directory in filename
order, excluding `catalog.json`. Each input may be a single scenario or a full
catalog. It validates all input and rejects duplicate IDs even for identical records,
identifying both files. It does not recurse; writer-generated `.tmp` files are excluded.

For several IDs sharing a method/path it calls `diagnostic` (default `console.info`)
with an informational message. A custom callback may collect, redirect, or suppress
those messages; a thrown callback error rejects merging before writing. Success writes
and returns `join(directory, 'catalog.json')`. An empty directory yields an empty
catalog. Read, parse, validation, and write errors reject the promise.

The local CLI is:

```sh
scenario-recorder-merge [directory]
```

The default directory is `artifacts/api-scenarios`. Success prints the output path;
failure prints the error and sets exit code 1. It performs no upload.

### File format and atomicity

Both writers sort scenario IDs lexically and object keys recursively, preserve array
order, indent with two spaces, and append a newline. Equivalent JSON data produces
byte-identical catalogs; stable values are the author's responsibility.

Writing uses an exclusive temporary file next to the destination and atomic rename,
with temporary-file cleanup in `finally`. Validation happens before writing. These
APIs provide no cross-command locking, redaction, normalization, or publication to
external services.
