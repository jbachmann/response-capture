# Response Capture

An npm workspace containing a NestJS API and an Angular UI. Turborepo runs
tasks through the existing Nest and Angular CLIs and caches builds and unit tests.

## Setup

Use Node.js 24 and npm 11.8.0. Install dependencies from the repository root:

```sh
nvm use
npm ci
```

The root `package-lock.json` is the only lockfile. Install application dependencies
with `npm install <package> --workspace=@response-capture/provider` or
`--workspace=@response-capture/consumer`. Frameworks and compilers remain declared
in their application packages; the API uses TypeScript 6 and the UI TypeScript 5.9.

## Development

```sh
npm run dev
```

This starts the API at http://localhost:3000 and the UI at http://localhost:4200.
Swagger UI is at http://localhost:3000/docs and OpenAPI JSON at
http://localhost:3000/docs-json. Stop both servers with Ctrl+C.

Run either application independently:

```sh
npm run dev --workspace=@response-capture/provider
npm run dev --workspace=@response-capture/consumer
```

Workspace scripts run from their application directory. The API's default SQLite
file is `apps/provider/data/petstore.sqlite`; `DATABASE_PATH` overrides it and
relative values resolve from `apps/provider`. Moving the original provider folder
preserves any existing local data alongside it. Production deployment should use
an explicit persistent database path.

## Verification and production builds

```sh
npm run build
npm test
npm run lint:provider
npm run test:e2e
npm run scenarios:merge
```

Builds produce `apps/provider/dist` and `apps/consumer/dist/consumer`.
Start the built API with `npm run start:prod --workspace=@response-capture/provider`.
Serve the UI's `dist/consumer/browser` directory using your chosen static host.
Deployment commands remain application-local.

Build and unit-test tasks use local Turbo caching in `.turbo/`. Development,
API end-to-end tests, and scenario merging are uncached. Before repeating a
scenario recording run, clear `apps/provider/artifacts/api-scenarios` as described
in the [recorder documentation](apps/provider/test/support/api-scenario-recorder/README.md).
The merged catalog lives at `apps/provider/artifacts/api-scenarios/catalog.json`.
Generated output, runtime data, and recordings are ignored by Git and excluded
from build and unit-test cache inputs. Remote caching is not configured.

For machines with limited resources, use `NG_BUILD_MAX_WORKERS=2 npm run build`
(or `npm test`) to limit Angular's build workers.

## Layout

- [apps/provider](apps/provider/README.md): API, SQLite persistence, and scenario recorder.
- [apps/consumer](apps/consumer/README.md): Angular UI and its local development instructions.
- `packages/*`: reserved workspace pattern for future shared libraries; no shared package exists yet.

Future shared contracts should expose browser-safe types rather than decorated
Nest DTOs. Each application's TypeScript configuration remains independent.
