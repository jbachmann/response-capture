# Scenario contract

Compare a recorded API scenario with consumer-owned Zod schemas in an ordinary test.
The consumer chooses the catalog, scenario ID, and request/response expectations.
The package supplies loading, snapshot sharing, and failure diagnostics.

This private workspace package targets Node 24. Zod `^4.3.6` is a peer dependency;
Vitest `^4.1.11` is an optional peer used only by the `/vitest` entrypoint.

## Entrypoints

| Import                                       | Responsibility                                                                               |
| -------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `@response-capture/scenario-contract`        | Runner-independent `assertScenarioContract`, `ScenarioContract`, and `CatalogSnapshot` types |
| `@response-capture/scenario-contract/node`   | `loadContractCatalog`, `prepareContractRun`, and source/run option types                     |
| `@response-capture/scenario-contract/vitest` | `contractGlobalSetup` and `getContractCatalog`                                               |

The root entrypoint has no Node, Vitest, or Playwright imports. Importing the package
does not fetch catalogs or start services. Build workspace dependencies before use:

```sh
npm run prepare
```

## Set up named catalogs in Vitest

Create a global setup module in the consumer:

```ts
// contract/global-setup.ts
import { fileURLToPath } from 'node:url';
import { contractGlobalSetup } from '@response-capture/scenario-contract/vitest';

export default contractGlobalSetup({
  rootDirectory: fileURLToPath(new URL('../', import.meta.url)),
  outputDirectory: 'test-results/contract',
  catalogs: {
    widgets: {
      systemName: 'widgets-api',
      catalogApiUrl: 'http://localhost:3001',
      selection: { latest: true },
    },
  },
});
```

Register it in a dedicated configuration:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['contract/**/*.contract.test.ts'],
    globalSetup: ['./contract/global-setup.ts'],
  },
});
```

Each distinct configured source loads once per run, even when registered under
multiple aliases. Workers receive the same recorded snapshot; every
`getContractCatalog('widgets')` call returns an independent copy. Unknown aliases
fail with a list of declared aliases. No consumer context declaration is needed.

The setup saves digest-bearing snapshots and a `source.json` manifest under a
unique UUID directory. The manifest maps aliases to numbered snapshot filenames
and provenance. Ignore the configured output directory in version control.
Loading errors fail the run without fallback. The setup function can also be
awaited from an existing application global setup.

## Write one explicit scenario test

Keep API-specific schemas in the consumer. The following test checks the complete
request and response objects, including the HTTP method, route, and status:

```ts
import { it } from 'vitest';
import { z } from 'zod';
import { assertScenarioContract } from '@response-capture/scenario-contract';
import { getContractCatalog } from '@response-capture/scenario-contract/vitest';

const widgetSchema = z.looseObject({
  id: z.int().positive(),
  label: z.string(),
  details: z.looseObject({ enabled: z.boolean() }),
});

it('returns a populated widget list', () => {
  assertScenarioContract(getContractCatalog('widgets'), 'widget.list.success', {
    request: z.looseObject({
      method: z.literal('GET'),
      path: z.literal('/widgets'),
      query: z.undefined(),
      body: z.null(),
    }),
    response: z.looseObject({
      status: z.literal(200),
      body: z.array(widgetSchema).min(1),
    }),
  });
});
```

`assertScenarioContract(snapshot, scenarioId, { request?, response? })` returns
`void` or throws. Supply at least one schema. Each supplied schema receives the
entire corresponding wire object, including any recorded headers or match hints.
Omit a comparison side to leave it unchecked; omit fields from a loose object
schema to impose no expectation on those fields. Unrelated scenarios are ignored.

Schemas must be synchronous. Parsed output is discarded and recorded input is
preserved, including when a refinement mutates its input. To detect incompatible
wire data, avoid coercion, defaults, or transformations in consumer schemas.
Failures include the system, scenario ID, catalog source, SHA-256 digest, and all
failing request/response field paths.

For a status-only error expectation:

```ts
assertScenarioContract(getContractCatalog('widgets'), 'widget.read.missing', {
  response: z.looseObject({ status: z.literal(404) }),
});
```

Add a request schema to that test when its method, path, query, or body also matter.
For query-bearing scenarios, validate decoded arrays, for example
`query: z.strictObject({ labels: z.array(z.string().min(1)).length(1) })`.

Parameterized routes are also consumer-owned Zod schemas:

```ts
const widgetPath = z
  .string()
  .regex(/^\/widgets\/\d+$/)
  .refine(
    (path) => {
      const id = Number(path.split('/').at(-1));
      return Number.isSafeInteger(id) && id > 0;
    },
    { message: 'Expected /widgets/{id} with a positive safe integer ID' },
  );
```

Use `path: widgetPath` in the request schema to check route structure without
fixing the recorded ID.

## File input and explicit loading

Choose exactly one source kind. A file source reads a raw version 1 catalog:

```ts
const fileSource = { systemName: 'widgets-api', file: 'fixtures/widgets.json' };
```

A remote source requires an API URL and an explicit selection:

```ts
const selectedSource = {
  systemName: 'widgets-api',
  catalogApiUrl: 'http://localhost:3001',
  selection: { selector: 'main' }, // Alias or commit; use { latest: true } for latest.
};
```

Pass either source in `catalogs` to Vitest setup. Environment variables, defaults,
and file precedence belong to the consumer; the package does not interpret them.
Relative input and output paths resolve from `rootDirectory`, which defaults to
`process.cwd()`. Blank files, system names, aliases, and selectors fail clearly.

Outside Vitest, use the same comparison with a loaded snapshot:

```ts
import { loadContractCatalog } from '@response-capture/scenario-contract/node';

const snapshot = await loadContractCatalog(fileSource, { rootDirectory: process.cwd() });
assertScenarioContract(snapshot, 'widget.read.missing', {
  response: z.looseObject({ status: z.literal(404) }),
});
```

`prepareContractRun({ catalogs, outputDirectory, rootDirectory? })` returns
`{ catalogs, directory }` for other runner integrations. Both Node helpers accept
an optional `fetcher` for fixture-based testing. An individual `loadContractCatalog`
call loads its source; run-scoped deduplication belongs to `prepareContractRun`.

## Verification

```sh
npm run test --workspace=@response-capture/scenario-contract
npm run test:contract:unit --workspace=@response-capture/petstore-ui
npm run test:contract
```

Package tests use non-Petstore fixtures. Petstore unit tests check its schemas and
run its explicit scenario suite against supplied raw fixtures without a catalog
API or internet access. Contract tests check the selected provider recordings;
they do not establish unrecorded provider behavior or its complete input space.
