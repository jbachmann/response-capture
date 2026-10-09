# Catalog API

NestJS API for storing catalog submissions in SQLite. Requires Node.js 24.

From the repository root, start the API before running `scenarios:merge`:

```sh
npm run dev --workspace=catalog
```

The default port is `3001`; `PORT` overrides it. `CATALOG_DATABASE_PATH` defaults
to `./data/catalog.sqlite`, relative to the app working directory (normally
`apps/catalog`). Parent directories are created automatically. Use `:memory:`
for ephemeral storage; use an explicit persistent path for production. Database
files and journals are gitignored. No existing catalogs are imported automatically.

## Submit and retrieve catalogs

Swagger UI is available at [http://localhost:3001/docs](http://localhost:3001/docs).
Use it to explore and try the endpoints. The OpenAPI document is available at
`/docs-json` (JSON) and `/docs-yaml` (YAML). These routes use the same port as the API.

```sh
curl -i -X PUT http://localhost:3001/catalog-submissions \
  -H 'Content-Type: application/json' \
  -d '{"systemName":"provider","commitHash":"example-commit","alias":"main","catalog":{"catalogVersion":1,"scenarios":[]}}'

curl http://localhost:3001/catalogs/provider
curl http://localhost:3001/catalogs/provider/main
curl http://localhost:3001/catalogs/provider/example-commit
curl http://localhost:3001/catalog-submission
```

`PUT /catalog-submissions` requires nonblank string `systemName` and `commitHash`,
and a `catalog` JSON object. Any system name and catalog object are accepted;
the API does not enforce the provider scenario schema. `alias` is an optional
string. There is no top-level `version` field. The JSON request limit is 10 MiB.
Invalid submissions return `400`; oversized requests return `413`; successful
submissions return `204` without a body.

`GET /catalog-submission` returns all stored submissions as an array, newest first,
with `systemName`, `commitHash`, `catalog`, and a UTC `submittedAt` timestamp.
`alias` is included only when supplied. An empty database returns `[]` with `200`.
Timestamp ties use the submission sequence. Replaced submissions appear once,
with their updated payload, alias, and timestamp.

The system/commit pair is unique. Submitting it again replaces the entire catalog
and alias, clears the alias when omitted, and refreshes the server-generated UTC
submission timestamp. Submissions survive application restarts.

`GET /catalogs/:systemName` returns the most recently submitted catalog.
`GET /catalogs/:systemName/:selector` returns the most recent submission matching
either its alias or commit hash. Both comparisons are exact and case-sensitive;
URL-encode path segments, including branch names containing slashes. If an alias
collides with a commit hash, the newest matching submission wins. Timestamp ties
are resolved by a persistent submission sequence, including for replacements.
Both GET endpoints return only the submitted catalog object, or `404` when no
matching submission exists.

## Checks and production

```sh
npm test --workspace=catalog
npm run test:e2e --workspace=catalog
npm run lint --workspace=catalog
npm run build --workspace=catalog
npm run start:prod --workspace=catalog
```

End-to-end tests require localhost sockets. Tests use isolated temporary or
in-memory databases. No authentication is configured.
