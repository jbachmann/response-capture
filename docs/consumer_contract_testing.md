# Set up consumer contract tests

Use `@response-capture/scenario-contract` to check recorded provider examples against
schemas owned by your consumer. Each ordinary Vitest test chooses a catalog, a
stable scenario ID, and the request/response fields it needs.

These examples use the `petstore-api` provider and name its catalog `pets` in the
consumer. Tests read recordings; they do not send the recorded requests to the
provider or start a browser.

## 1. Add a dedicated test configuration

Add the package and testing dependencies to your consumer workspace's
`package.json`. These are compatible with the versions verified in this repository:

```json
{
  "devDependencies": {
    "@response-capture/scenario-contract": "*",
    "@types/node": "24.10.1",
    "typescript": "5.9.3",
    "vitest": "4.1.11",
    "zod": "4.3.6"
  },
  "scripts": {
    "test:contract": "tsc -p contract/tsconfig.json && vitest run --config contract/vitest.config.ts"
  }
}
```

Merge these entries with existing dependencies and scripts. Use Node 24, then run
`npm install` and `npm run prepare` from the repository root to link and build the
workspace packages.

Create `contract/vitest.config.ts` inside the consumer workspace:

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

Create `contract/tsconfig.json` to type-check the suite independently of application
or browser-test configuration:

```json
{
  "compilerOptions": {
    "strict": true,
    "skipLibCheck": true,
    "target": "ES2022",
    "module": "preserve",
    "moduleResolution": "bundler",
    "types": ["node"],
    "noEmit": true
  },
  "include": ["./**/*.ts"]
}
```

Ignore `/test-results/` in the consumer's `.gitignore`.

## 2. Choose the catalog in global setup

Create `contract/global-setup.ts`:

```ts
import { fileURLToPath } from 'node:url';
import { contractGlobalSetup } from '@response-capture/scenario-contract/vitest';

export default contractGlobalSetup({
  rootDirectory: fileURLToPath(new URL('../', import.meta.url)),
  outputDirectory: 'test-results/contract',
  catalogs: {
    pets: {
      systemName: 'petstore-api',
      catalogApiUrl: 'http://localhost:3001',
      selection: { latest: true },
    },
  },
});
```

`pets` is your local alias, used by tests. `petstore-api` identifies the provider in
the catalog API. Each distinct configured source loads once per run, including
when multiple aliases refer to it. Workers receive the same catalog contents.

For a specific alias or commit, replace the selection:

```ts
selection: { selector: 'main' },
```

For a raw local catalog, replace the entire `pets` source:

```ts
pets: {
  systemName: 'petstore-api',
  file: '../petstore-api/artifacts/api-scenarios/catalog.json',
},
```

File paths resolve from `rootDirectory`, here the consumer workspace. A source
chooses either a file or an API URL plus selection. The package does not interpret
environment variables; see [the existing Petstore source adapter](../apps/petstore-ui/contract/catalog-source.ts)
for `CONTRACT_CATALOG_PATH` precedence and `CATALOG_API_URL`/`CATALOG_SELECTOR`
defaults.

## 3. Define schemas and write one test

Create `contract/schemas.ts` with consumer-owned schemas. This focused example
checks a subset of pet fields; add nested category and tag schemas if your
consumer relies on them.

```ts
import { z } from 'zod';

export const petSchema = z.looseObject({
  id: z.int().positive(),
  name: z.string(),
  photoUrls: z.array(z.string()),
  status: z.enum(['available', 'pending', 'sold']),
});
```

Create `contract/pets.contract.test.ts`:

```ts
import { it } from 'vitest';
import { z } from 'zod';
import { assertScenarioContract } from '@response-capture/scenario-contract';
import { getContractCatalog } from '@response-capture/scenario-contract/vitest';
import { petSchema } from './schemas';

const catalog = getContractCatalog('pets');

it('returns a populated pet list', () => {
  assertScenarioContract(catalog, 'pet.list.success', {
    request: z.looseObject({
      method: z.literal('GET'),
      path: z.literal('/pet'),
      query: z.undefined(),
      body: z.null(),
    }),
    response: z.looseObject({
      status: z.literal(200),
      body: z.array(petSchema).min(1),
    }),
  });
});
```

Read the catalog once at module scope and reuse it for tests in that file.
`getContractCatalog` returns a copy of the run snapshot, and the assertion copies
request/response data before validation. Fetch a fresh copy inside a test if that
test deliberately modifies its catalog.

The two schemas validate **complete request and response objects**. For example,
the response schema describes both `status` and `body`; passing `petSchema`
directly as `response` would compare it against the wrong object.

Use `z.looseObject` to accept additional fields. Schemas must be synchronous;
avoid coercion, defaults, and transformations that could hide incompatible wire
data. Supply at least one of `request` or `response`. An omitted comparison side,
or a field omitted from a loose object schema, imposes no expectation.

## 4. Adapt the test for common scenarios

The following tests go in the same file and reuse its imports and `catalog`.

### Check query parameters

Recorded query values are decoded string arrays, even for a single value. A
strict query object can require exactly the parameter your consumer sends:

```ts
it('filters pets by one status', () => {
  assertScenarioContract(catalog, 'pet.filter.by-status.success', {
    request: z.looseObject({
      method: z.literal('GET'),
      path: z.literal('/pet/findByStatus'),
      query: z.strictObject({
        status: z.array(z.enum(['available', 'pending', 'sold'])).length(1),
      }),
      body: z.null(),
    }),
    response: z.looseObject({
      status: z.literal(200),
      body: z.array(petSchema).min(1),
    }),
  });
});
```

### Check a parameterized route and an error status

Validate route structure and a positive safe integer ID, rather than fixing the
recorded ID. Converting the route segment inside a refinement performs a check;
it does not transform the recorded pathname.

```ts
const petPath = z
  .string()
  .regex(/^\/pet\/\d+$/)
  .refine(
    (path) => {
      const id = Number(path.split('/').at(-1));
      return Number.isSafeInteger(id) && id > 0;
    },
    { message: 'Expected /pet/{id} with a positive safe integer ID' },
  );

it('reports a missing pet', () => {
  assertScenarioContract(catalog, 'pet.read.missing', {
    request: z.looseObject({
      method: z.literal('GET'),
      path: petPath,
      query: z.undefined(),
      body: z.null(),
    }),
    response: z.looseObject({ status: z.literal(404) }),
  });
});
```

This checks the error status without constraining error-body fields the consumer
does not use. A success test can use the same route schema and require
`response: z.looseObject({ status: z.literal(200), body: petSchema })`.

### Check bodyless deletion

Both the recorded bodyless request and the 204 response body are `null`:

```ts
it('deletes a pet without a response body', () => {
  assertScenarioContract(catalog, 'pet.delete.success', {
    request: z.looseObject({
      method: z.literal('DELETE'),
      path: petPath,
      query: z.undefined(),
      body: z.null(),
    }),
    response: z.looseObject({ status: z.literal(204), body: z.null() }),
  });
});
```

## 5. Run and inspect failures

Run the dedicated script in your consumer workspace. For the existing Petstore
consumer, these commands run from the repository root:

```sh
# Read the latest published catalog from the configured catalog API.
npm run test:contract

# Read a published alias or commit.
CATALOG_SELECTOR=main npm run test:contract

# Read a fresh local capture; no catalog API is needed for comparison.
npm run scenarios:capture
CONTRACT_CATALOG_PATH=../petstore-api/artifacts/api-scenarios/catalog.json npm run test:contract
```

The environment-variable commands use Petstore's source adapter described above.
For a new consumer, supply its source in global setup and run
`npm run test:contract --workspace=<consumer-workspace-name>`. The root script
currently targets Petstore and builds its workspace dependencies through Turbo.

A missing scenario ID or an incompatible field fails its individual test. Errors
include the provider, scenario ID, source URL or file, SHA-256 digest, and field
path, such as `response.body.0.status`. Loading errors fail the run without
fallback. Snapshots and their source manifest remain in
`test-results/contract/<run-id>/` for inspection.

In the existing Petstore consumer,
`npm run test:contract:unit --workspace=@response-capture/petstore-ui` checks its
schemas and executes the suite against supplied fixtures. It needs neither a
running catalog API nor internet access.

See the [package guide](../packages/scenario-contract/README.md) for standalone
loading and API details, and the [Petstore tests](../apps/petstore-ui/contract/pets.contract.test.ts)
for the complete consumer examples. These tests establish compatibility of
recorded examples with consumer expectations; unrecorded behavior remains outside
their coverage.
