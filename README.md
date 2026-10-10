# Response Capture

An npm workspace containing two NestJS APIs and two Angular UIs. Turborepo runs
tasks through the existing Nest and Angular CLIs and caches builds and unit tests.

## Setup

Use Node.js 24 and npm 11.8.0. Install dependencies from the repository root:

```sh
nvm use
npm ci
```

The root `package-lock.json` is the only lockfile. Install application dependencies
with `npm install <package> --workspace=@response-capture/petstore-api` or
`--workspace=@response-capture/petstore-ui`, `--workspace=catalog-api`, or `--workspace=catalog-ui`. Frameworks and compilers remain declared
in their application packages; the API uses TypeScript 6 and the UI TypeScript 5.9.

## Development

```sh
npm run dev
```

This starts the Petstore API at http://localhost:3000, the catalog API at
http://localhost:3001, the Petstore UI at http://localhost:4200, and the catalog UI
at http://localhost:4201.
Swagger UI is at http://localhost:3000/docs and OpenAPI JSON at
http://localhost:3000/docs-json. Stop all servers with Ctrl+C.

Run an application independently:

```sh
npm run dev --workspace=@response-capture/petstore-api
npm run dev --workspace=@response-capture/petstore-ui
npm run dev --workspace=catalog-api
npm run dev --workspace=catalog-ui
```

Workspace scripts run from their application directory. The API's default SQLite
file is `apps/petstore-api/data/petstore.sqlite`; `DATABASE_PATH` overrides it and
relative values resolve from `apps/petstore-api`. Renaming the application folder
preserves any existing local data alongside it. Production deployment should use
an explicit persistent database path.

## Verification and production builds

```sh
npm run build
npm test
npm run lint:petstore-api
npm run test:e2e
npm run test:e2e:ui
npm run scenarios:merge
```

Builds produce `apps/petstore-api/dist`, `apps/catalog-api/dist`, `apps/petstore-ui/dist/petstore-ui`,
and `apps/catalog-ui/dist/catalog-ui`.
Start the built API with `npm run start:prod --workspace=@response-capture/petstore-api`.
Serve `apps/petstore-ui/dist/petstore-ui/browser` and
`apps/catalog-ui/dist/catalog-ui/browser` using your chosen static hosts.
Deployment commands remain application-local.

Build and unit-test tasks use local Turbo caching in `.turbo/`. Development,
API and UI end-to-end tests, and scenario merging are uncached. The UI browser
suite uses catalog-backed MSW responses and requires a submitted catalog;
see the [Petstore UI test workflow](apps/petstore-ui/README.md#catalog-backed-browser-tests).
Before repeating a
scenario recording run, clear `apps/petstore-api/artifacts/api-scenarios` as described
in the [recorder documentation](apps/petstore-api/test/support/api-scenario-recorder/README.md).
Start the catalog API before merging (`npm run dev --workspace=catalog-api`, or the
combined development command). The merged catalog lives at
`apps/petstore-api/artifacts/api-scenarios/catalog.json` and is also submitted to
`PUT /catalog-submissions` at `http://localhost:3001`. Set `CATALOG_API_URL` to
change the API base URL. Submissions use system name `petstore-api`, the full current
Git commit hash, and the current branch as alias. `CATALOG_ALIAS` overrides the
alias; an empty override or detached HEAD omits it. Historical submissions under
`provider` remain available separately; new submissions use `petstore-api`.
Submission failures fail the command but retain the generated local file.

The catalog API stores submissions in `apps/catalog-api/data/catalog.sqlite` by
default; `CATALOG_DATABASE_PATH` overrides it independently of the petstore-api's
`DATABASE_PATH`. See the [catalog API documentation](apps/catalog-api/README.md) for
lookup routes and persistence configuration. The catalog-ui Scenario library at `/` loads
catalog inventory from that API and lets you select a system and Latest or a
recorded commit. Its default system is the first alphabetically.

For production, forward `/catalog-inventory` and `/catalogs/**` on catalog-ui's
origin to the catalog API. Forward petstore, order, and training routes to the
petstore-api on the petstore-ui origin. Serve each Angular application for its UI routes;
never apply the Angular fallback to API paths. The petstore-api no longer serves
`/training/catalog`.

Generated output, runtime data, and recordings are ignored by Git and excluded
from build and unit-test cache inputs. Remote caching is not configured.

For machines with limited resources, use `NG_BUILD_MAX_WORKERS=2 npm run build`
(or `npm test`) to limit Angular's build workers.

## Layout

- [apps/petstore-api](apps/petstore-api/README.md): API, SQLite persistence, and scenario recorder.
- [apps/petstore-ui](apps/petstore-ui/README.md): Angular UI and its local development instructions.
- [apps/catalog-api](apps/catalog-api/README.md): NestJS catalog API.
- [apps/catalog-ui](apps/catalog-ui/README.md): Angular Scenario library.
- `packages/contracts`: browser-safe wire types and scenario validation, compiled to ESM.
- `packages/ui`: Angular theme and route-focus code, plus common CSS; compiled by each UI.

Shared contracts expose browser-safe types; decorated Nest DTOs remain in the APIs.
The contracts package uses TypeScript 5.9 for compatibility with both UI compilers.
Each application's TypeScript configuration remains independent. Both development
servers exclude shared Angular source entrypoints from Vite prebundling so Angular
compiles their decorators; see [Angular's prebundling guidance](https://angular.dev/tools/cli/build-system-migration#prebundling). `npm ci` builds
contracts through the root prepare script. Root Turbo commands build dependencies
before application tasks; during combined development contracts run a compiler watcher.

Formatting uses the root Prettier configuration. Run `npm run format:check` or
`npm run format` from the root.

## Compatibility changes

Both APIs now return 404 for `GET /`; the generated greeting endpoints were removed.
Use a documented feature route to verify connectivity. Catalog browsing and recording
share strict version 1 validation: unknown schema fields, duplicate IDs, and matching
hints inconsistent with their request body are rejected. Legacy scenarios without
metadata remain valid. The catalog storage API still accepts arbitrary JSON objects.
Stored payloads and SQLite schemas are unchanged; fix invalid scenario data at its
source and submit a corrected catalog rather than modifying stored records in place.
