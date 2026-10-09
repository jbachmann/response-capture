# Catalog API

NestJS API for storing catalog submissions in SQLite. Requires Node.js 24.

From the repository root, start the API before running `scenarios:merge`:

```sh
npm run dev --workspace=catalog-api
```

The default port is `3001`; `PORT` overrides it. `CATALOG_DATABASE_PATH` defaults
to `./data/catalog.sqlite`, relative to the app working directory (normally
`apps/catalog-api`). Parent directories are created automatically. Use `:memory:`
for ephemeral storage; use an explicit persistent path for production. Database
files and journals are gitignored. No existing catalogs are imported automatically.

## Submit and retrieve catalogs

Swagger UI is available at [http://localhost:3001/docs](http://localhost:3001/docs).
Use it to explore and try the endpoints. The OpenAPI document is available at
`/docs-json` (JSON) and `/docs-yaml` (YAML). These routes use the same port as the API.

```sh
curl -i -X PUT http://localhost:3001/catalog-submissions \
  -H 'Content-Type: application/json' \
  -d '{"systemName":"petstore-api","commitHash":"example-commit","alias":"main","catalog":{"catalogVersion":1,"scenarios":[]}}'

curl http://localhost:3001/catalogs/petstore-api
curl http://localhost:3001/catalogs/petstore-api/main
curl http://localhost:3001/catalogs/petstore-api/example-commit
curl http://localhost:3001/catalog-submission
curl http://localhost:3001/catalog-inventory
```

`PUT /catalog-submissions` requires nonblank string `systemName` and `commitHash`,
and a `catalog` JSON object. Any system name and catalog object are accepted;
the API does not enforce the petstore-api scenario schema. `alias` is an optional
string. There is no top-level `version` field. The JSON request limit is 10 MiB.
Invalid submissions return `400`; oversized requests return `413`; successful
submissions return `204` without a body.

`GET /catalog-submission` returns all stored submissions as an array, newest first,
with `systemName`, `commitHash`, `catalog`, and a UTC `submittedAt` timestamp.
`alias` is included only when supplied. An empty database returns `[]` with `200`.
Timestamp ties use the submission sequence. Replaced submissions appear once,
with their updated payload, alias, and timestamp.

`GET /catalog-inventory` returns a manifest grouped by system, without catalog
payloads. Systems are ordered by name; each system's `catalogs` array is ordered
newest first, with submission sequence resolving timestamp ties. Each entry has
`commitHash`, optional `alias`, and `submittedOn` (a UTC ISO 8601 timestamp in JSON).
Replaced submissions appear once with current metadata. An empty database returns
`{ "systems": [] }` with `200`.

```json
{
  "systems": [
    {
      "name": "petstore-api",
      "catalogs": [
        {
          "commitHash": "example-commit",
          "alias": "main",
          "submittedOn": "2026-10-09T12:00:00.000Z"
        }
      ]
    }
  ]
}
```

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
npm test --workspace=catalog-api
npm run test:e2e --workspace=catalog-api
npm run lint --workspace=catalog-api
npm run build --workspace=catalog-api
npm run start:prod --workspace=catalog-api
```

End-to-end tests require localhost sockets. Tests use isolated temporary or
in-memory databases. No authentication is configured.
